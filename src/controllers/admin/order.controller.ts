import { JsonController, Get, Put, Post, Param, QueryParams, Body, Res, UseBefore } from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { Order } from "../../entity/Order";
import { Customer } from "../../entity/Customer";
import { ReturnOrder } from "../../entity/ReturnOrder";
import { Attribute } from "../../entity/Attribute";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { response, pagination, handleErrorResponse } from "../../utils";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { restoreStockForOrder } from "../../utils/stockLogger";

@JsonController("/orders")
@UseBefore(AuthMiddleware)
export class AdminOrderController {
    private orderRepo = AppDataSource.getMongoRepository(Order);
    private customerRepo = AppDataSource.getMongoRepository(Customer);
    private returnOrderRepo = AppDataSource.getMongoRepository(ReturnOrder);

    @Get("/list")
    async listOrders(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const status = query.status;
            const paymentStatus = query.paymentStatus;
            let search = query.search?.trim();

            const match: any = { isDelete: { $ne: 1 } };
            if (status) {
                match.orderStatus = status;
            }

            if (paymentStatus && paymentStatus !== "All") {
                if (paymentStatus === "Paid") {
                    match.paymentStatus = "Paid";
                } else if (paymentStatus === "Unpaid") {
                    match.paymentStatus = { $in: ["Pending", "Failed", "Partially Paid"] };
                }
            }

            if (search) {
                match.$or = [
                    { orderId: { $regex: search, $options: "i" } },
                    { invoiceId: { $regex: search, $options: "i" } }
                ];
            }

            const orderId = query.orderId;
            if (orderId) {
                match.orderId = orderId;
            }

            const sortOrder = query.sortOrder === "asc" ? "ASC" : "DESC";
            const skip = page * limit;

            const [orders, total] = await this.orderRepo.findAndCount({
                where: match,
                order: { createdAt: sortOrder } as any,
                take: limit,
                skip: skip
            });

            const countMatch: any = { isDelete: { $ne: 1 } };
            if (paymentStatus && paymentStatus !== "All") {
                if (paymentStatus === "Paid") {
                    countMatch.paymentStatus = "Paid";
                } else if (paymentStatus === "Unpaid") {
                    countMatch.paymentStatus = { $in: ["Pending", "Failed", "Partially Paid"] };
                }
            }

            if (search) {
                countMatch.$or = [
                    { orderId: { $regex: search, $options: "i" } },
                    { invoiceId: { $regex: search, $options: "i" } }
                ];
            }

            if (orderId) {
                countMatch.orderId = orderId;
            }

            // Fetch counts for main statuses (Pending, Packed, Shipped, Delivered)
            const statusCounts = await Promise.all([
                this.orderRepo.countBy({ ...countMatch, orderStatus: "Pending" } as any),
                this.orderRepo.countBy({ ...countMatch, orderStatus: "Packed" } as any),
                this.orderRepo.countBy({ ...countMatch, orderStatus: "Shipped" } as any),
                this.orderRepo.countBy({ ...countMatch, orderStatus: "Delivered" } as any)
            ]);

            return response(res, StatusCodes.OK, "Orders fetched successfully", {
                total,
                data: orders,
                limit,
                page,
                counts: {
                    Pending: statusCounts[0],
                    Packed: statusCounts[1],
                    Shipped: statusCounts[2],
                    Delivered: statusCounts[3]
                }
            });
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/cancelled/list")
    async listCancelledOrders(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const skip = page * limit;

            const [orders, total] = await this.orderRepo.findAndCount({
                where: { orderStatus: "Cancelled", isDelete: { $ne: 1 } } as any,
                order: { cancelDate: "DESC" } as any,
                take: limit,
                skip: skip
            });

            return pagination(total, orders, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:id")
    async getOrderDetails(@Param("id") id: string, @Res() res: any) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");

            const order = await this.orderRepo.findOneBy({ _id: new ObjectId(id) });
            if (!order) return response(res, StatusCodes.NOT_FOUND, "Order not found");

            let customerInfo = null;
            if (order.userId) {
                const customer = await this.customerRepo.findOneBy({ _id: new ObjectId(order.userId) });
                const orderCount = await this.orderRepo.countBy({
                    userId: new ObjectId(order.userId),
                    isDelete: 0
                });

                if (customer) {
                    customerInfo = {
                        fullName: customer.fullName,
                        phoneNumber: customer.phoneNumber,
                        email: customer.email,
                        orderCount: orderCount,
                        createdAt: customer.createdAt
                    };
                }
            }

            // Resolve attribute names and value names for each product combination
            const attributeRepo = AppDataSource.getMongoRepository(Attribute);

            if (order.products) {
                for (const product of order.products) {
                    if (product.combination && product.combination.length > 0) {
                        for (const comb of product.combination) {
                            if (comb.attributeId) {
                                try {
                                    const attr = await attributeRepo.findOneBy({ _id: new ObjectId(comb.attributeId) });
                                    if (attr) {
                                        (comb as any).attributeName = attr.name;
                                        if (comb.valueId) {
                                            const valObj = attr.values?.find((v: any) => v._id?.toString() === comb.valueId.toString());
                                            if (valObj) {
                                                (comb as any).valueName = valObj.name;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error("Error resolving attribute:", e);
                                }
                            }
                        }
                    }
                }
            }

            return response(res, StatusCodes.OK, "Order details fetched successfully", {
                order,
                customer: customerInfo
            });
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/update-status/:id")
    async updateStatus(@Param("id") id: string, @Body() body: { status: string, cancelReason?: string }, @Res() res: any) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");

            const order = await this.orderRepo.findOneBy({ _id: new ObjectId(id) });
            if (!order) return response(res, StatusCodes.NOT_FOUND, "Order not found");

            // Handle Cancellation Reason
            if (body.status === "Cancelled") {
                order.cancelReason = body.cancelReason;
                order.cancelDate = new Date();

                // Restore Stock
                await restoreStockForOrder(order.products, "cancel", "Order", order.id);
            }

            // Handle Return Creation
            if (body.status === "Return") {
                const exists = await this.returnOrderRepo.findOneBy({ originalOrderId: new ObjectId(id) });
                if (!exists) {
                    const returnOrder = new ReturnOrder();
                    returnOrder.originalOrderId = new ObjectId(id);
                    returnOrder.userId = order.userId;
                    returnOrder.products = order.products;
                    returnOrder.totalAmount = order.totalAmount;
                    returnOrder.taxAmount = order.taxAmount;
                    returnOrder.shippingCharge = order.shippingCharge;
                    returnOrder.grandTotal = order.grandTotal;
                    returnOrder.paymentMethod = order.paymentMethod;
                    returnOrder.paymentStatus = order.paymentStatus;
                    returnOrder.orderStatus = "Return-Initiated";
                    returnOrder.address = order.address;
                    returnOrder.orderIdString = order.orderId;
                    returnOrder.isActive = 1;
                    returnOrder.isDelete = 0;
                    await this.returnOrderRepo.save(returnOrder);
                }
            }

            order.orderStatus = body.status;
            order.updatedAt = new Date();
            await this.orderRepo.save(order);

            return response(res, StatusCodes.OK, "Order status updated successfully", order);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/returns/list")
    async listReturnOrders(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const status = query.status || "Return-Initiated";
            const skip = page * limit;

            const match: any = { orderStatus: status };
            // Handle MongoDB documents where isDelete might be missing
            match.isDelete = { $ne: 1 };

            const [orders, total] = await this.returnOrderRepo.findAndCount({
                where: match,
                order: { createdAt: "DESC" } as any,
                take: limit,
                skip: skip
            });

            // Status counts for Return sub-tabs
            const returnCounts = await Promise.all([
                this.returnOrderRepo.countBy({ orderStatus: "Return-Initiated", isDelete: { $ne: 1 } } as any),
                this.returnOrderRepo.countBy({ orderStatus: "Approved", isDelete: { $ne: 1 } } as any),
                this.returnOrderRepo.countBy({ orderStatus: "Pickedup", isDelete: { $ne: 1 } } as any),
                this.returnOrderRepo.countBy({ orderStatus: "Received to Warehouse", isDelete: { $ne: 1 } } as any)
            ]);

            return response(res, StatusCodes.OK, "Return orders fetched successfully", {
                total,
                data: orders,
                limit,
                page,
                counts: {
                    "Return-Initiated": returnCounts[0],
                    "Approved": returnCounts[1],
                    "Pickedup": returnCounts[2],
                    "Received to Warehouse": returnCounts[3]
                }
            });
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/returns/details/:id")
    async getReturnOrderDetails(@Param("id") id: string, @Res() res: any) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");
            const order = await this.returnOrderRepo.findOneBy({ _id: new ObjectId(id) });
            if (!order) return response(res, StatusCodes.NOT_FOUND, "Return order not found");

            let customerInfo = null;
            if (order.userId) {
                const customer = await this.customerRepo.findOneBy({ _id: new ObjectId(order.userId) });
                if (customer) {
                    customerInfo = {
                        fullName: customer.fullName,
                        phoneNumber: customer.phoneNumber,
                        email: customer.email,
                        createdAt: customer.createdAt
                    };
                }
            }

            // Resolve attribute names and value names for each product combination
            const attributeRepo = AppDataSource.getMongoRepository(Attribute);

            if (order.products) {
                for (const product of order.products) {
                    if (product.combination && product.combination.length > 0) {
                        for (const comb of product.combination) {
                            if (comb.attributeId) {
                                try {
                                    const attr = await attributeRepo.findOneBy({ _id: new ObjectId(comb.attributeId) });
                                    if (attr) {
                                        (comb as any).attributeName = attr.name;
                                        if (comb.valueId) {
                                            const valObj = attr.values?.find((v: any) => v._id?.toString() === comb.valueId.toString());
                                            if (valObj) {
                                                (comb as any).valueName = valObj.name;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error("Error resolving attribute:", e);
                                }
                            }
                        }
                    }
                }
            }

            return response(res, StatusCodes.OK, "Return order details fetched successfully", {
                order,
                customer: customerInfo
            });
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/returns/update-status/:id")
    async updateReturnStatus(@Param("id") id: string, @Body() body: { status: string }, @Res() res: any) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");
            const order = await this.returnOrderRepo.findOneBy({ _id: new ObjectId(id) });
            if (!order) return response(res, StatusCodes.NOT_FOUND, "Return order not found");

            order.orderStatus = body.status;
            order.updatedAt = new Date();
            await this.returnOrderRepo.save(order);

            // Restore Stock if Received to Warehouse
            if (body.status === "Received to Warehouse") {
                await restoreStockForOrder(order.products, "return", "ReturnOrder", order.id);
            }

            return response(res, StatusCodes.OK, "Return order status updated successfully", order);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
