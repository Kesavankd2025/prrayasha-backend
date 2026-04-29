import { Get, JsonController, Post, Body, Req, Res, UseBefore } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Customer } from "../../entity/Customer";
import { Order } from "../../entity/Order";
import { Cart } from "../../entity/Cart";
import { Wishlist } from "../../entity/Wishlist";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { handleErrorResponse, response } from "../../utils";

@JsonController("/customer")
@UseBefore(AuthMiddleware)
export class WebsiteCustomerController {
    private customerRepo = AppDataSource.getMongoRepository(Customer);
    private orderRepo = AppDataSource.getMongoRepository(Order);
    private cartRepo = AppDataSource.getMongoRepository(Cart);
    private wishlistRepo = AppDataSource.getMongoRepository(Wishlist);

    @Get("/dashboard-stats")
    async getDashboardStats(@Req() req: any, @Res() res: Response) {
        try {
            const userId = new ObjectId(req.user.userId);

            const [orderCount, cartCount, wishlistCount, latestOrder] = await Promise.all([
                this.orderRepo.countBy({ userId, isDelete: 0 }),
                this.cartRepo.countBy({ userId }),
                this.wishlistRepo.countBy({ userId }),
                this.orderRepo.findOne({
                    where: { userId, isDelete: 0 },
                    order: { createdAt: "DESC" }
                })
            ]);

            return response(res, StatusCodes.OK, "Dashboard stats fetched successfully", {
                orderCount,
                cartCount,
                wishlistCount,
                latestOrder
            });
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/update-profile")
    async updateProfile(@Req() req: any, @Body() body: any, @Res() res: Response) {
        try {
            const userId = new ObjectId(req.user.userId);
            const customer = await this.customerRepo.findOneBy({ _id: userId, isDelete: 0 });

            if (!customer) {
                return response(res, StatusCodes.NOT_FOUND, "Customer not found");
            }

            // Update fields
            customer.fullName = body.name ?? customer.fullName;
            customer.email = body.email ?? customer.email;
            customer.phoneNumber = body.phone ?? customer.phoneNumber;

            await this.customerRepo.save(customer);

            return response(res, StatusCodes.OK, "Profile updated successfully", {
                user: {
                    id: customer.id,
                    fullName: customer.fullName,
                    email: customer.email,
                    phone: customer.phoneNumber
                }
            });
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
