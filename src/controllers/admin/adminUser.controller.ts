import {
    JsonController,
    Post,
    Get,
    Put,
    Delete,
    Param,
    Body,
    Res,
    QueryParams,
    UseBefore,
    Req,
    Patch
} from "routing-controllers";
import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { AdminUser } from "../../entity/AdminUser";
import { Admin } from "../../entity/Admin";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { response, handleErrorResponse, pagination } from "../../utils";
import { CreateAdminUserDto, UpdateAdminUserDto } from "../../dto/admin/AdminUser.dto";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/adminUser")
export class AdminUserController {
    private adminUserRepository = AppDataSource.getMongoRepository(AdminUser);
    private adminRepository = AppDataSource.getMongoRepository(Admin);

    @Post("/")
    async createAdminUser(
        @Body() body: CreateAdminUserDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const { phoneNumber, email, pin, name, profileImage, roleId, isActive } = body;

            // 🔹 Check if phone number already exists in AdminUser or Admin
            const existingAdminUser = await this.adminUserRepository.findOneBy({
                phoneNumber,
                isDelete: 0
            });

            if (existingAdminUser) {
                return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin User");
            }

            const existingAdmin = await this.adminRepository.findOneBy({
                phoneNumber,
                isDelete: 0
            });

            if (existingAdmin) {
                return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin");
            }

            const adminUser = new AdminUser();
            adminUser.name = name;
            adminUser.profileImage = profileImage;
            adminUser.email = email || "";
            adminUser.phoneNumber = phoneNumber;
            adminUser.pin = await bcrypt.hash(pin, 10);
            adminUser.roleId = new ObjectId(roleId);
            adminUser.createdBy = new ObjectId(req.user.userId);
            adminUser.updatedBy = new ObjectId(req.user.userId);
            adminUser.isActive = isActive ?? 1;
            adminUser.isDelete = 0;

            const savedAdminUser = await this.adminUserRepository.save(adminUser);

            return response(
                res,
                StatusCodes.CREATED,
                "Admin User created successfully",
                savedAdminUser
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/")
    async getAllAdminUsers(
        @QueryParams() query: any,
        @Res() res: Response
    ) {
        try {
            const page = Math.max(Number(query.page) || 0, 0);
            const limit = Math.max(Number(query.limit) || 10, 1);
            const search = query.search?.trim();

            const match: any = {
                isDelete: 0
            };

            if (query.status !== undefined) {
                match.isActive = Number(query.status);
            }

            const pipeline: any[] = [
                { $match: match },
                {
                    $lookup: {
                        from: "roles",
                        localField: "roleId",
                        foreignField: "_id",
                        as: "role"
                    }
                },
                {
                    $unwind: {
                        path: "$role",
                        preserveNullAndEmptyArrays: true
                    }
                }
            ];

            if (search) {
                pipeline.push({
                    $match: {
                        $or: [
                            { name: { $regex: search, $options: "i" } },
                            { email: { $regex: search, $options: "i" } },
                            { phoneNumber: { $regex: search, $options: "i" } },
                            { "role.name": { $regex: search, $options: "i" } }
                        ]
                    }
                });
            }

            pipeline.push(
                {
                    $sort: {
                        isActive: -1,
                        createdAt: -1
                    }
                },
                {
                    $facet: {
                        data: [
                            { $skip: page * limit },
                            { $limit: limit },
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                    email: 1,
                                    phoneNumber: 1,
                                    isActive: 1,
                                    roleId: 1,
                                    roleName: "$role.name",
                                    profileImage: 1,
                                    createdAt: 1,
                                    updatedAt: 1
                                }
                            }
                        ],
                        meta: [
                            { $count: "total" }
                        ]
                    }
                }
            );

            const result = await this.adminUserRepository.aggregate(pipeline).toArray();

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/:id")
    async getAdminUserById(
        @Param("id") id: string,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid ID format");
            }

            const pipeline: any[] = [
                {
                    $match: {
                        _id: new ObjectId(id),
                        isDelete: 0
                    }
                },
                {
                    $lookup: {
                        from: "roles",
                        localField: "roleId",
                        foreignField: "_id",
                        as: "role"
                    }
                },
                {
                    $unwind: {
                        path: "$role",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        name: 1,
                        email: 1,
                        phoneNumber: 1,
                        isActive: 1,
                        roleId: 1,
                        roleName: "$role.name",
                        createdAt: 1,
                        updatedAt: 1,
                        profileImage: 1
                    }
                }
            ];

            const result = await this.adminUserRepository.aggregate(pipeline).toArray();

            if (!result.length) {
                return response(res, StatusCodes.NOT_FOUND, "Admin User not found");
            }

            return response(
                res,
                StatusCodes.OK,
                "Admin User fetched successfully",
                result[0]
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/:id")
    async updateAdminUser(
        @Param("id") id: string,
        @Body() body: UpdateAdminUserDto,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid ID format");
            }

            const adminUser = await this.adminUserRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!adminUser) {
                return response(res, StatusCodes.NOT_FOUND, "Admin User not found");
            }

            if (body.phoneNumber && body.phoneNumber !== adminUser.phoneNumber) {
                const mobileExists = await this.adminUserRepository.findOneBy({
                    phoneNumber: body.phoneNumber,
                    isDelete: 0
                });

                if (mobileExists) {
                    return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin User");
                }

                const adminExists = await this.adminRepository.findOneBy({
                    phoneNumber: body.phoneNumber,
                    isDelete: 0
                });

                if (adminExists) {
                    return response(res, StatusCodes.CONFLICT, "Mobile number already exists as an Admin");
                }

                adminUser.phoneNumber = body.phoneNumber;
            }

            if (body.name) adminUser.name = body.name;
            if (body.profileImage) adminUser.profileImage = body.profileImage;
            if (body.email !== undefined) adminUser.email = body.email;
            if (body.pin) {
                adminUser.pin = await bcrypt.hash(body.pin, 10);
            }
            if (body.roleId) adminUser.roleId = new ObjectId(body.roleId);
            if (body.isActive !== undefined) adminUser.isActive = body.isActive;

            adminUser.updatedBy = new ObjectId(req.user.userId);
            await this.adminUserRepository.save(adminUser);

            return response(
                res,
                StatusCodes.OK,
                "Admin User updated successfully",
                adminUser
            );
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Delete("/:id")
    async deleteAdminUser(@Param("id") id: string, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid ID format");
            }

            const adminUser = await this.adminUserRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!adminUser) {
                return response(res, StatusCodes.NOT_FOUND, "Admin User not found");
            }

            adminUser.isDelete = 1;
            await this.adminUserRepository.save(adminUser);

            return response(res, StatusCodes.OK, "Admin User deleted successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Patch("/:id/toggle-active")
    async toggleActiveStatus(@Param("id") id: string, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid ID format");
            }

            const adminUser = await this.adminUserRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!adminUser) {
                return response(res, StatusCodes.NOT_FOUND, "Admin User not found");
            }

            adminUser.isActive = adminUser.isActive === 1 ? 0 : 1;
            await this.adminUserRepository.save(adminUser);

            return response(
                res,
                StatusCodes.OK,
                `Admin User ${adminUser.isActive === 1 ? "enabled" : "disabled"} successfully`,
                { isActive: adminUser.isActive }
            );
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
