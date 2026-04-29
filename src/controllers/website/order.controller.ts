import { JsonController, Post, Body, Res, UseBefore, Req, Get, Param, QueryParam } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Order } from "../../entity/Order";
import { Customer } from "../../entity/Customer";
import { Product } from "../../entity/Product";
import { Cart } from "../../entity/Cart";
import { Attribute } from "../../entity/Attribute";
import { ReturnOrder, ReturnOrderStatus } from "../../entity/ReturnOrder";
import { CreateOrderDto, CancelReturnOrderDto } from "../../dto/website/order.dto";
import { handleErrorResponse, pagination, response } from "../../utils";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { deductStockForOrder, restoreStockForOrder } from "../../utils/stockLogger";
import { All } from "routing-controllers";
import axios from "axios";
import crypto from "crypto";

@JsonController("/order")
export class WebsiteOrderController {
    private orderRepo = AppDataSource.getMongoRepository(Order);
    private customerRepo = AppDataSource.getMongoRepository(Customer);
    private productRepo = AppDataSource.getMongoRepository(Product);
    private cartRepo = AppDataSource.getMongoRepository(Cart);
    private returnRepo = AppDataSource.getMongoRepository(ReturnOrder);

    @Post("/create")
    @UseBefore(AuthMiddleware)
    async createOrder(@Body() body: CreateOrderDto, @Res() res: Response) {
        try {
            // Validate if userId is a valid ObjectId
            if (!ObjectId.isValid(body.userId)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid user ID");
            }

            // Check if customer exists
            const customer = await this.customerRepo.findOneBy({
                _id: new ObjectId(body.userId),
                isDelete: 0
            });

            if (!customer) {
                return response(res, StatusCodes.NOT_FOUND, "Customer not found");
            }

            // Create new order
            const order = new Order();
            order.userId = new ObjectId(body.userId);

            // Map products and fetch real names if possible
            order.products = await Promise.all(body.products.map(async (p) => {
                const product = await this.productRepo.findOneBy({ _id: new ObjectId(p.productId) });
                return {
                    productId: new ObjectId(p.productId),
                    productName: product ? product.name : p.productName,
                    sku: p.sku,
                    combination: p.combination?.map(c => ({
                        attributeId: new ObjectId(c.attributeId),
                        valueId: c.valueId ? new ObjectId(c.valueId) : undefined,
                        value: c.value
                    })),
                    price: Number(p.price),
                    mrp: Number(p.mrp),
                    qty: Number(p.qty),
                    total: Number(p.total),
                    image: p.image
                };
            }));

            order.totalAmount = Number(body.totalAmount);
            order.taxAmount = Number(body.taxAmount);
            order.shippingCharge = Number(body.shippingCharge);
            order.grandTotal = Number(body.grandTotal);
            order.paymentMethod = body.paymentMethod;
            order.paymentStatus = body.paymentStatus || "Pending";
            order.orderStatus = body.orderStatus || "Pending";
            order.couponCode = body.couponCode;
            order.couponDiscount = body.couponDiscount ? Number(body.couponDiscount) : 0;
            order.shippingDiscount = body.shippingDiscount ? Number(body.shippingDiscount) : 0;
            order.overallDiscount = order.couponDiscount + order.shippingDiscount;

            // if (body.shippingMethodId) {
            //     order.shippingMethodId = new ObjectId(body.shippingMethodId);
            // }

            order.address = {
                name: body.address.name,
                phone: body.address.phone,
                doorNo: body.address.doorNo,
                street: body.address.street,
                city: body.address.city,
                state: body.address.state,
                pincode: body.address.pincode
            };

            order.isActive = 1;
            order.isDelete = 0;
            order.createdAt = new Date();

            // Generate Order ID (ORD-1, ORD-2...)
            const lastOrderWithId = await this.orderRepo.findOne({
                where: { orderId: { $regex: /^ORD-/ } } as any,
                order: { createdAt: "DESC" }
            });
            let nextOrderNo = 1;
            if (lastOrderWithId && lastOrderWithId.orderId) {
                const parts = lastOrderWithId.orderId.split("-");
                if (parts.length > 1) {
                    nextOrderNo = parseInt(parts[1]) + 1;
                }
            }
            order.orderId = `ORD-${nextOrderNo}`;

            // Generate Invoice ID (PC-1, PC-2...)
            const lastOrderWithInvoice = await this.orderRepo.findOne({
                where: { invoiceId: { $regex: /^PC-/ } } as any,
                order: { createdAt: "DESC" }
            });
            let nextInvoiceNo = 1;
            if (lastOrderWithInvoice && lastOrderWithInvoice.invoiceId) {
                const parts = lastOrderWithInvoice.invoiceId.split("-");
                if (parts.length > 1) {
                    nextInvoiceNo = parseInt(parts[1]) + 1;
                }
            }
            order.invoiceId = `PC-${nextInvoiceNo}`;
            order.invoiceNo = nextInvoiceNo;
            order.orderFrom = "Website";

            await this.orderRepo.save(order);

            if (body.paymentMethod === "PHONEPE") {
                const merchantId = process.env.PHONEPE_MERCHANT_ID || 'M22HOTYLY403R';
                const apiKey = process.env.PHONEPE_SALT_KEY || 'dfe4668a-e8ae-40a5-b456-3679b72014bc';
                const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';
                const backendUrl = process.env.BACKEND_URL || "https://prrayasha-backend.onrender.com";

                const redirectUrl = `${backendUrl}/api/website/order/phonepe/redirect`;
                const callbackUrl = `${backendUrl}/api/website/order/phonepe/callback`;

                // max 38 chars
                const merchantTransactionId = 'T' + Date.now() + Math.floor(Math.random() * 1000);

                const transaction_data = {
                    merchantId: merchantId,
                    merchantTransactionId: merchantTransactionId,
                    merchantOrderId: order.id.toString(),
                    merchantUserId: order.userId.toString(),
                    amount: Math.round(order.grandTotal * 100),
                    redirectUrl: redirectUrl,
                    redirectMode: "POST",
                    callbackUrl: callbackUrl,
                    paymentInstrument: {
                        type: "PAY_PAGE"
                    }
                };

                const encode = Buffer.from(JSON.stringify(transaction_data)).toString('base64');
                const payload = encode + "/pg/v1/pay" + apiKey;
                const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
                const final_x_header = sha256 + '###' + saltIndex;

                const requestData = { request: encode };

                const isProd = process.env.PHONEPE_ENV === "PROD";
                const phonepeUrl = isProd
                    ? "https://api.phonepe.com/apis/hermes/pg/v1/pay"
                    : "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";

                const phonepeRes = await axios.post(phonepeUrl, requestData, {
                    headers: {
                        "Content-Type": "application/json",
                        "X-VERIFY": final_x_header,
                        "accept": "application/json"
                    }
                });

                if (phonepeRes.data && phonepeRes.data.code === 'PAYMENT_INITIATED') {
                    const payUrl = phonepeRes.data.data.instrumentResponse.redirectInfo.url;

                    order.transactionId = merchantTransactionId;
                    await this.orderRepo.save(order);

                    return response(res, StatusCodes.CREATED, "Order pending payment", { order, payUrl });
                } else {
                    return response(res, StatusCodes.BAD_REQUEST, "Failed to initiate payment", phonepeRes.data);
                }
            }

            // Clear Cart after successful order (for COD / others)
            await this.cartRepo.deleteMany({ userId: order.userId });

            // Deduct Stock
            await deductStockForOrder(order.products, "order", "Order", order.id, order.userId);

            return response(res, StatusCodes.CREATED, "Order created successfully", order);
        } catch (error: any) {
            console.error("Order creation error:", error.response?.data || error.message);
            return handleErrorResponse(error, res);
        }
    }

    @All("/phonepe/redirect")
    async paymentRedirect(@Req() req: any, @Res() res: Response) {
        try {
            const data = req.body || req.query;
            const { transactionId, code, merchantOrderId } = data;
            const frontendUrl = process.env.FRONTEND_URL || "https://prrayasha-website.vercel.app";

            if (code === "PAYMENT_SUCCESS") {
                const order = await this.orderRepo.findOneBy({ _id: new ObjectId(merchantOrderId) } as any);
                if (order && order.paymentStatus !== "Paid") {
                    order.paymentStatus = "Paid";
                    order.transactionId = transactionId;
                    await this.orderRepo.save(order);

                    // Clear cart
                    await this.cartRepo.deleteMany({ userId: order.userId });
                    // Deduct stock
                    await deductStockForOrder(order.products, "order", "Order", order.id, order.userId);
                }
                return res.redirect(`${frontendUrl}/checkout?status=success&orderId=${merchantOrderId}`);
            } else {
                return res.redirect(`${frontendUrl}/checkout?status=failed`);
            }
        } catch (error) {
            console.error("Redirect Error:", error);
            return res.redirect(`https://prrayasha-website.vercel.app/checkout?status=error`);
        }
    }

    @Post("/phonepe/callback")
    async paymentCallback(@Req() req: any, @Res() res: Response) {
        try {
            console.log("Phonepe callback data:", req.body);
            return res.status(200).send("OK");
        } catch (error: any) {
            return res.status(500).send("Error");
        }
    }

    @Get("/list")
    @UseBefore(AuthMiddleware)
    async listOrders(
        @Req() req: any,
        @QueryParam("status") status: string,
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @QueryParam("search") search: string,
        @Res() res: Response
    ) {
        try {
            const userId = new ObjectId(req.user.userId);
            const match: any = { userId, isDelete: 0 };
            if (status) {
                match.orderStatus = status;
            }

            if (search) {
                match.$or = [
                    { orderId: { $regex: search, $options: "i" } },
                    { invoiceId: { $regex: search, $options: "i" } },
                    { "products.productName": { $regex: search, $options: "i" } }
                ];
            }

            const pipeline: any[] = [
                { $match: match },
                { $sort: { createdAt: -1 } },
                {
                    $facet: {
                        data: [{ $skip: Number(page) * Number(limit) }, { $limit: Number(limit) }],
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const result = await this.orderRepo.aggregate(pipeline).toArray();
            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, Number(limit), Number(page), res);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:id")
    @UseBefore(AuthMiddleware)
    async getOrderDetails(@Req() req: any, @Param("id") id: string, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");

            const userId = new ObjectId(req.user.userId);
            const order: any = await this.orderRepo.findOneBy({
                _id: new ObjectId(id),
                userId,
                isDelete: 0
            });

            if (!order) {
                return response(res, StatusCodes.NOT_FOUND, "Order not found");
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
                                        comb.attributeName = attr.name;
                                        if (comb.valueId) {
                                            const valObj = attr.values?.find((v: any) => v._id?.toString() === comb.valueId.toString());
                                            if (valObj) {
                                                comb.valueName = valObj.name;
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

            return response(res, StatusCodes.OK, "Order details fetched successfully", order);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/cancel/:id")
    @UseBefore(AuthMiddleware)
    async cancelOrder(@Req() req: any, @Param("id") id: string, @Body() body: CancelReturnOrderDto, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");

            const userId = new ObjectId(req.user.userId);
            const order = await this.orderRepo.findOneBy({
                _id: new ObjectId(id),
                userId,
                isDelete: 0
            });

            if (!order) {
                return response(res, StatusCodes.NOT_FOUND, "Order not found");
            }

            // Allowed to cancel only if Pending
            if (order.orderStatus !== "Pending") {
                return response(res, StatusCodes.BAD_REQUEST, `Cannot cancel order with status: ${order.orderStatus}. Only Pending orders can be cancelled.`);
            }

            order.orderStatus = "Cancelled";
            order.cancelReason = body.reason;
            order.cancelDate = new Date();

            await this.orderRepo.save(order);

            // Restore Stock
            await restoreStockForOrder(order.products, "cancel", "Order", order.id, userId);

            return response(res, StatusCodes.OK, "Order cancelled successfully", order);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/return/:id")
    @UseBefore(AuthMiddleware)
    async returnOrder(@Req() req: any, @Param("id") id: string, @Body() body: CancelReturnOrderDto, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");

            const userId = new ObjectId(req.user.userId);
            const order = await this.orderRepo.findOneBy({
                _id: new ObjectId(id),
                userId,
                isDelete: 0
            });

            if (!order) {
                return response(res, StatusCodes.NOT_FOUND, "Order not found");
            }

            // Allowed to return only if Delivered
            if (order.orderStatus !== "Delivered") {
                return response(res, StatusCodes.BAD_REQUEST, "Format: Only delivered orders can be returned.");
            }

            order.orderStatus = "Return"; // Status is "Return" based on existing enum
            order.returnReason = body.reason;
            order.returnDate = new Date();

            await this.orderRepo.save(order);

            // Restore Stock
            await restoreStockForOrder(order.products, "return", "Order", order.id, userId);

            // Create Return Order Collection Record
            const returnOrder = new ReturnOrder();
            returnOrder.originalOrderId = order.id;
            returnOrder.userId = order.userId;
            returnOrder.products = order.products;
            returnOrder.totalAmount = order.totalAmount;
            returnOrder.taxAmount = order.taxAmount;
            returnOrder.shippingCharge = order.shippingCharge;
            returnOrder.grandTotal = order.grandTotal;
            returnOrder.paymentMethod = order.paymentMethod;
            returnOrder.paymentStatus = order.paymentStatus;
            returnOrder.orderStatus = ReturnOrderStatus.INITIATED;
            returnOrder.address = order.address;
            returnOrder.isActive = 1;
            returnOrder.isDelete = 0;
            returnOrder.createdAt = new Date();
            returnOrder.orderIdString = order.id.toString();
            returnOrder.returnReason = body.reason;
            returnOrder.returnDate = order.returnDate;
            returnOrder.invoiceId = order.invoiceId;
            returnOrder.invoiceNo = order.invoiceNo;

            await this.returnRepo.save(returnOrder);

            return response(res, StatusCodes.OK, "Return request submitted successfully", order);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
