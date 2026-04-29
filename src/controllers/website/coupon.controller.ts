import { JsonController, Post, Body, Res } from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { Coupon } from "../../entity/Coupon";
import { Customer } from "../../entity/Customer";
import { Order } from "../../entity/Order";
import { handleErrorResponse, response } from "../../utils";
import { Response } from "express";

@JsonController("/coupons")
export class WebsiteCouponController {
    private repo = AppDataSource.getMongoRepository(Coupon);
    private orderRepo = AppDataSource.getMongoRepository(Order);

    @Post("/validate")
    async validate(
        @Body() body: { code: string; subTotal: number; customerId?: string; cartItems: any[] },
        @Res() res: Response
    ) {
        try {
            const { code, subTotal, customerId, cartItems } = body;
            const now = new Date();

            const coupon = await this.repo.findOneBy({ code, status: true, isDelete: 0 });
            if (!coupon) return response(res, StatusCodes.NOT_FOUND, "Invalid coupon code");

            // 1. Date Check
            if (now < coupon.startDate) return response(res, StatusCodes.BAD_REQUEST, "Coupon not yet active");
            if (now > coupon.endDate) return response(res, StatusCodes.BAD_REQUEST, "Coupon has expired");

            // 2. Usage Limit Check
            if (coupon.usedCount >= coupon.totalLimit) return response(res, StatusCodes.BAD_REQUEST, "Total usage limit reached for this coupon");

            // 3. Min Order Amount Check
            if (coupon.minOrderAmount && subTotal < coupon.minOrderAmount) {
                return response(res, StatusCodes.BAD_REQUEST, `Minimum order amount of ${coupon.minOrderAmount} required`);
            }

            // 4. User Eligibility Check
            if (customerId) {
                if (!ObjectId.isValid(customerId)) return response(res, StatusCodes.BAD_REQUEST, "Invalid customer id");
                
                const customerRepo = AppDataSource.getMongoRepository(Customer);
                const customer = await customerRepo.findOneBy({ _id: new ObjectId(customerId), isDelete: 0 });
                if (!customer) return response(res, StatusCodes.NOT_FOUND, "Customer not found");

                // Check customer usage limit (In a real scenario, check orders with this coupon code)
                // We'll perform a count of existing orders for this customer with this coupon code
                const userUsageCount = await this.orderRepo.count({
                    where: {
                        userId: new ObjectId(customerId),
                        couponCode: code,
                        isDelete: 0
                    }
                });

                if (userUsageCount >= coupon.userLimit) {
                    return response(res, StatusCodes.BAD_REQUEST, "You have reached the usage limit for this coupon");
                }

                // Check new user only
                if (coupon.applicableUserType === "new") {
                    const orderCount = await this.orderRepo.countBy({ userId: new ObjectId(customerId), isDelete: 0 });
                    if (orderCount > 0) return response(res, StatusCodes.BAD_REQUEST, "This coupon is only for new customers");
                }

                // Specific users check
                if (coupon.applicableUserType === "specific") {
                    const isSpecified = coupon.specificUserIds?.some(id => id.toString() === customerId);
                    if (!isSpecified) return response(res, StatusCodes.BAD_REQUEST, "This coupon is not available for your account");
                }
            } else if (coupon.applicableUserType !== "all") {
                return response(res, StatusCodes.UNAUTHORIZED, "Login required to use this coupon");
            }

            // 5. Product/Category Exclusion & Offer Type
            let eligibleSubtotal = 0;
            
            cartItems.forEach(item => {
                let isEligible = true;

                // Exclusion Rules
                if (coupon.excludedCategoryIds?.some(id => id.toString() === item.categoryId)) isEligible = false;
                if (coupon.excludedProductIds?.some(id => id.toString() === item.productId)) isEligible = false;

                // Targeted Rules
                if (isEligible) {
                    if (coupon.offerType === "category") {
                        if (!coupon.categoryIds?.some(id => id.toString() === item.categoryId)) isEligible = false;
                    } else if (coupon.offerType === "product") {
                        if (!coupon.productIds?.some(id => id.toString() === item.productId)) isEligible = false;
                    }
                }

                if (isEligible) eligibleSubtotal += (item.price * item.quantity);
            });

            if (eligibleSubtotal === 0) return response(res, StatusCodes.BAD_REQUEST, "No eligible items in cart for this coupon");

            // 6. Discount Calculation
            let discountAmount = 0;
            if (coupon.discountType === "percentage") {
                discountAmount = (eligibleSubtotal * coupon.discountValue) / 100;
                if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
                    discountAmount = coupon.maxDiscountAmount;
                }
            } else {
                discountAmount = coupon.discountValue;
                if (discountAmount > eligibleSubtotal) discountAmount = eligibleSubtotal;
            }

            return response(res, StatusCodes.OK, "Coupon validated successfully", {
                id: coupon.id,
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                discountAmount,
                finalAmount: subTotal - discountAmount
            });
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
