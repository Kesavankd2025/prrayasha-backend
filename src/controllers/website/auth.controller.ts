import { JsonController, Post, Body, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../../data-source";
import { Customer } from "../../entity/Customer";
import { OTP } from "../../entity/OTP";
import { UserToken } from "../../entity/UserToken";
import { SendOtpDto, VerifyOtpDto, RegisterDto } from "../../dto/website/auth.dto";
import { handleErrorResponse, response } from "../../utils";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/jwt";
import { sendOTPViaSMS } from "../../utils/textspeed";

@JsonController("/auth")
export class WebsiteAuthController {
    private repo = AppDataSource.getMongoRepository(Customer);
    private otpRepo = AppDataSource.getMongoRepository(OTP);
    private tokenRepo = AppDataSource.getMongoRepository(UserToken);

    // ─── REGISTER: Step 1 - Send OTP ────────────────────────────────
    @Post("/register/send-otp")
    async registerSendOtp(@Body() body: SendOtpDto, @Res() res: Response) {
        try {
            const existing = await this.repo.findOne({
                where: { phoneNumber: body.phoneNumber, isDelete: 0 }
            });

            if (existing && existing.userType === "registered") {
                return response(res, StatusCodes.BAD_REQUEST, "Mobile number already registered");
            }

            await this.generateAndSendOTP(body.phoneNumber);

            return response(res, StatusCodes.OK, "OTP sent successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    // ─── REGISTER: Step 2 - Verify OTP + Create/Update Account ─────────────
    @Post("/register/verify-otp")
    async registerVerifyOtp(@Body() body: RegisterDto, @Res() res: Response) {
        try {
            const isValid = await this.verifyOTPCode(body.phoneNumber, body.otp);
            if (!isValid) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid or expired OTP");
            }

            let customer = await this.repo.findOne({
                where: { phoneNumber: body.phoneNumber, isDelete: 0 }
            });

            if (customer && customer.userType === "registered") {
                return response(res, StatusCodes.BAD_REQUEST, "Mobile number already registered");
            }

            if (!customer) {
                customer = new Customer();
                customer.phoneNumber = body.phoneNumber;
                customer.isDelete = 0;
            }

            customer.fullName = body.fullName;
            customer.email = body.email;
            customer.userType = "registered";
            customer.isActive = true;

            await this.repo.save(customer);
            await this.otpRepo.deleteMany({ phoneNumber: body.phoneNumber });

            const token = this.issueToken(customer);
            await this.saveToken(customer, token);

            return response(res, StatusCodes.CREATED, "Registration successful", {
                token,
                user: {
                    id: customer.id,
                    fullName: customer.fullName,
                    phoneNumber: customer.phoneNumber,
                    email: customer.email,
                    userType: customer.userType
                }
            });
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    // ─── LOGIN: Step 1 - Send OTP ────────────────────────────────────
    @Post("/login/send-otp")
    async loginSendOtp(@Body() body: SendOtpDto, @Res() res: Response) {
        try {
            const customer = await this.repo.findOne({
                where: { phoneNumber: body.phoneNumber, isDelete: 0 }
            });

            if (!customer) {
                return response(res, StatusCodes.NOT_FOUND, "Mobile number not registered");
            }

            if (!customer.isActive) {
                return response(res, StatusCodes.FORBIDDEN, "Account is inactive");
            }

            await this.generateAndSendOTP(body.phoneNumber);

            return response(res, StatusCodes.OK, "OTP sent successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    // ─── LOGIN: Step 2 - Verify OTP + Issue Token ────────────────────
    @Post("/login/verify-otp")
    async loginVerifyOtp(@Body() body: VerifyOtpDto, @Res() res: Response) {
        try {
            const isValid = await this.verifyOTPCode(body.phoneNumber, body.otp);
            if (!isValid) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid or expired OTP");
            }

            const customer = await this.repo.findOne({
                where: { phoneNumber: body.phoneNumber, isDelete: 0 }
            });

            if (!customer) {
                return response(res, StatusCodes.NOT_FOUND, "User not found");
            }

            await this.otpRepo.deleteMany({ phoneNumber: body.phoneNumber });

            const token = this.issueToken(customer);
            await this.saveToken(customer, token);

            customer.lastLogin = new Date();
            await this.repo.save(customer);

            return response(res, StatusCodes.OK, "Login successful", {
                token,
                user: {
                    id: customer.id,
                    fullName: customer.fullName,
                    phoneNumber: customer.phoneNumber,
                    email: customer.email,
                    userType: customer.userType
                }
            });
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    // ─── GUEST LOGIN: Step 1 - Send OTP ─────────────────────────────
    @Post("/guest/send-otp")
    async guestSendOtp(@Body() body: SendOtpDto, @Res() res: Response) {
        try {
            await this.generateAndSendOTP(body.phoneNumber);
            return response(res, StatusCodes.OK, "OTP sent successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    // ─── GUEST LOGIN: Step 2 - Verify OTP + Issue Token ──────────────
    @Post("/guest/verify-otp")
    async guestVerifyOtp(@Body() body: VerifyOtpDto, @Res() res: Response) {
        try {
            const isValid = await this.verifyOTPCode(body.phoneNumber, body.otp);
            if (!isValid) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid or expired OTP");
            }

            let customer = await this.repo.findOne({
                where: { phoneNumber: body.phoneNumber, isDelete: 0 }
            });

            if (!customer) {
                customer = new Customer();
                customer.phoneNumber = body.phoneNumber;
                customer.userType = "guest";
                customer.isActive = true;
                customer.isDelete = 0;
                await this.repo.save(customer);
            }

            await this.otpRepo.deleteMany({ phoneNumber: body.phoneNumber });

            const token = this.issueToken(customer);
            await this.saveToken(customer, token);

            return response(res, StatusCodes.OK, "Guest login successful", {
                token,
                user: {
                    id: customer.id,
                    fullName: customer.fullName,
                    phoneNumber: customer.phoneNumber,
                    email: customer.email,
                    userType: customer.userType
                }
            });
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    // ─── PRIVATE HELPERS ─────────────────────────────────────────────

    private async generateAndSendOTP(phoneNumber: string) {
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

        await this.otpRepo.deleteMany({ phoneNumber });
        await this.otpRepo.save({ phoneNumber, otp: otpCode, expiresAt, isVerified: false });

        await sendOTPViaSMS(phoneNumber, otpCode); // TextSpeed call
    }

    private async verifyOTPCode(phoneNumber: string, otp: string): Promise<boolean> {
        const record = await this.otpRepo.findOne({
            where: { phoneNumber, otp, isVerified: false }
        });

        if (!record) return false;
        if (new Date() > record.expiresAt) return false;

        return true;
    }

    private issueToken(customer: Customer): string {
        return jwt.sign(
            { id: customer.id.toString(), phoneNumber: customer.phoneNumber, userType: "CUSTOMER" },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN as any }
        );
    }

    private async saveToken(customer: Customer, token: string) {
        await this.tokenRepo.deleteMany({ userId: customer.id });
        await this.tokenRepo.save({
            userId: customer.id,
            userType: "CUSTOMER",
            token: token
        });
    }
}