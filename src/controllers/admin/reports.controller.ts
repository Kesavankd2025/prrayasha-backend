import { JsonController, Get, QueryParams, Res, UseBefore } from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { Order } from "../../entity/Order";
import { Customer } from "../../entity/Customer";
import { Vendor } from "../../entity/Vendor";
import { PurchaseOrder } from "../../entity/PurchaseOrder";
import { VendorPayment } from "../../entity/VendorPayment";
import { PaymentDetail } from "../../entity/PaymentDetail";
import { StockLog } from "../../entity/StockLog";
import { StatusCodes } from "http-status-codes";
import { response, pagination, handleErrorResponse } from "../../utils";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { ObjectId } from "mongodb";

@JsonController("/reports")
@UseBefore(AuthMiddleware)
export class ReportsController {
    private orderRepo = AppDataSource.getMongoRepository(Order);
    private customerRepo = AppDataSource.getMongoRepository(Customer);
    private vendorRepo = AppDataSource.getMongoRepository(Vendor);
    private purchaseOrderRepo = AppDataSource.getMongoRepository(PurchaseOrder);
    private vendorPaymentRepo = AppDataSource.getMongoRepository(VendorPayment);

    @Get("/product")
    async productReport(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const search = query.search?.trim();
            const fromDate = query.fromDate;
            const toDate = query.toDate;
            const orderFrom = query.orderFrom;

            const match: any = { isDelete: { $ne: 1 } };

            if (orderFrom) {
                if (orderFrom === "Both") {
                    match.orderFrom = { $in: ["POS", "Website", undefined] };
                } else {
                    match.orderFrom = orderFrom;
                }
            }

            if (fromDate || toDate) {
                match.createdAt = {};
                if (fromDate) match.createdAt["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    match.createdAt["$lte"] = tDate;
                }
            }

            const pipeline: any[] = [
                { $match: match },
                { $unwind: "$products" },
                {
                    $group: {
                        _id: "$products.productId",
                        productName: { $first: "$products.productName" },
                        sku: { $first: "$products.sku" },
                        totalQuantitySold: { $sum: { $toDouble: { $ifNull: ["$products.qty", "$products.quantity"] } } },
                        totalRevenue: { $sum: { $toDouble: "$products.total" } },
                    }
                }
            ];

            if (search) {
                pipeline.push({
                    $match: {
                        $or: [
                            { productName: { $regex: search, $options: "i" } },
                            { sku: { $regex: search, $options: "i" } }
                        ]
                    }
                });
            }

            pipeline.push({ $sort: { totalQuantitySold: -1 } });

            if (limit !== -1) {
                pipeline.push(
                    {
                        $facet: {
                            data: [{ $skip: page * limit }, { $limit: limit }],
                            meta: [{ $count: "total" }]
                        }
                    }
                );
            }

            const result = await this.orderRepo.aggregate(pipeline).toArray();

            if (limit === -1) {
                return response(res, StatusCodes.OK, "Product reports fetched successfully", result);
            }

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/customer")
    async customerReport(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const search = query.search?.trim();
            const fromDate = query.fromDate;
            const toDate = query.toDate;

            const match: any = { isDelete: { $ne: 1 } };

            if (fromDate || toDate) {
                match.createdAt = {};
                if (fromDate) match.createdAt["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    match.createdAt["$lte"] = tDate;
                }
            }

            const pipeline: any[] = [
                { $match: match },
                {
                    $group: {
                        _id: "$userId",
                        totalOrders: { $sum: 1 },
                        totalSpent: { $sum: { $toDouble: "$grandTotal" } },
                        lastOrderDate: { $max: "$createdAt" }
                    }
                },
                {
                    $lookup: {
                        from: "customers",
                        localField: "_id",
                        foreignField: "_id",
                        as: "customerData"
                    }
                },
                { $unwind: { path: "$customerData", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        fullName: { $ifNull: ["$customerData.fullName", "Guest User"] },
                        phoneNumber: { $ifNull: ["$customerData.phoneNumber", "N/A"] },
                        email: { $ifNull: ["$customerData.email", "N/A"] },
                        totalOrders: 1,
                        totalSpent: 1,
                        lastOrderDate: 1
                    }
                }
            ];

            if (search) {
                pipeline.push({
                    $match: {
                        $or: [
                            { fullName: { $regex: search, $options: "i" } },
                            { phoneNumber: { $regex: search, $options: "i" } }
                        ]
                    }
                });
            }

            pipeline.push({ $sort: { totalSpent: -1 } });

            if (limit !== -1) {
                pipeline.push(
                    {
                        $facet: {
                            data: [{ $skip: page * limit }, { $limit: limit }],
                            meta: [{ $count: "total" }]
                        }
                    }
                );
            }

            const result = await this.orderRepo.aggregate(pipeline).toArray();

            if (limit === -1) {
                return response(res, StatusCodes.OK, "Customer reports fetched successfully", result);
            }

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/vendor")
    async vendorReport(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const search = query.search?.trim();
            const fromDate = query.fromDate;
            const toDate = query.toDate;

            const match: any = { isDelete: 0 };

            if (fromDate || toDate) {
                match.createdAt = {};
                if (fromDate) match.createdAt["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    match.createdAt["$lte"] = tDate;
                }
            }

            const pipeline: any[] = [
                { $match: match },
                {
                    $group: {
                        _id: "$vendorId",
                        totalPurchases: { $sum: 1 },
                        totalAmount: { $sum: { $toDouble: "$grandTotal" } },
                        totalPaid: { $sum: { $toDouble: "$paidAmount" } },
                    }
                },
                {
                    $lookup: {
                        from: "vendors",
                        localField: "_id",
                        foreignField: "_id",
                        as: "vendorData"
                    }
                },
                { $unwind: "$vendorData" },
                {
                    $project: {
                        vendorName: "$vendorData.name", // entity uses 'name'
                        contactPerson: "$vendorData.contactPerson",
                        contactNumber: "$vendorData.phoneNumber", // entity uses 'phoneNumber'
                        totalPurchases: 1,
                        totalAmount: 1,
                        totalPaid: 1,
                        pendingAmount: { $subtract: ["$totalAmount", "$totalPaid"] }
                    }
                }
            ];

            if (search) {
                pipeline.push({
                    $match: {
                        $or: [
                            { vendorName: { $regex: search, $options: "i" } },
                            { contactPerson: { $regex: search, $options: "i" } },
                            { contactNumber: { $regex: search, $options: "i" } }
                        ]
                    }
                });
            }

            pipeline.push({ $sort: { pendingAmount: -1 } });

            if (limit !== -1) {
                pipeline.push(
                    {
                        $facet: {
                            data: [{ $skip: page * limit }, { $limit: limit }],
                            meta: [{ $count: "total" }]
                        }
                    }
                );
            }

            const result = await this.purchaseOrderRepo.aggregate(pipeline).toArray();

            if (limit === -1) {
                return response(res, StatusCodes.OK, "Vendor reports fetched successfully", result);
            }

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/payment")
    async paymentReport(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const paymentMode = query.paymentMode;
            const fromDate = query.fromDate;
            const toDate = query.toDate;

            let filterDate: any = {};
            if (fromDate || toDate) {
                if (fromDate) filterDate["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    filterDate["$lte"] = tDate;
                }
            }

            let allPayments: any[] = [];

            // 1. Incoming: From PaymentDetail (Covers both POS and Manual/Partial Website Payments)
            const pdMatch: any = { isDelete: 0 };
            if (Object.keys(filterDate).length > 0) pdMatch.createdAt = filterDate;
            
            const pdPipeline: any[] = [
                { $match: pdMatch },
                {
                    $lookup: {
                        from: "orders",
                        localField: "orderId",
                        foreignField: "_id",
                        as: "order"
                    }
                },
                { $unwind: "$order" },
                { $unwind: "$payments" },
                {
                    $project: {
                        date: "$createdAt",
                        type: { $literal: "Incoming" },
                        source: { $cond: { if: { $eq: ["$order.orderFrom", "POS"] }, then: "POS Order", else: "Website Order" } },
                        referenceId: { $ifNull: ["$order.orderId", "$order.invoiceId"] },
                        method: "$payments.method",
                        amount: { $toDouble: "$payments.amount" }
                    }
                }
            ];
            
            if (paymentMode) pdPipeline.push({ $match: { method: paymentMode } });
            const pdetailRecords = await AppDataSource.getMongoRepository(PaymentDetail).aggregate(pdPipeline).toArray();
            allPayments.push(...pdetailRecords);

            // 2. Incoming: Standard Website Orders (Paid ones that might not have PaymentDetail)
            const orderMatch: any = { 
                orderFrom: { $ne: "POS" }, 
                isDelete: 0, 
                paymentStatus: "Paid" 
            };
            if (Object.keys(filterDate).length > 0) orderMatch.createdAt = filterDate;
            if (paymentMode) orderMatch.paymentMethod = paymentMode;

            // Find orders that DONT have a payment detail (to avoid double counting manual updates)
            const websiteOrders = await this.orderRepo.find({ where: orderMatch });
            for (const order of websiteOrders) {
                // Check if this order already has payment details accounted for above
                const hasDetailedPayment = pdetailRecords.some(p => p.referenceId === (order.orderId || order.invoiceId));
                if (!hasDetailedPayment) {
                    allPayments.push({
                        date: order.createdAt,
                        type: "Incoming",
                        source: "Website Order",
                        referenceId: order.orderId || order.invoiceId || "-",
                        method: order.paymentMethod || "Cash",
                        amount: Number(order.grandTotal || 0)
                    });
                }
            }

            // 3. Outgoing: Vendor Payments
            const vendorMatch: any = { isDelete: 0 };
            if (Object.keys(filterDate).length > 0) vendorMatch.paymentDate = filterDate;
            if (paymentMode) vendorMatch.paymentMethod = paymentMode;

            const vendorPipeline: any[] = [
                { $match: vendorMatch },
                {
                    $lookup: {
                        from: "purchase_orders",
                        localField: "purchaseOrderId",
                        foreignField: "_id",
                        as: "po"
                    }
                },
                { $unwind: { path: "$po", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        date: { $ifNull: ["$paymentDate", "$createdAt"] },
                        type: { $literal: "Outgoing" },
                        source: { $literal: "Vendor Payment" },
                        referenceId: { $ifNull: ["$po.orderId", "N/A"] },
                        method: { $ifNull: ["$paymentMethod", "Cash"] },
                        amount: { $toDouble: "$amount" }
                    }
                }
            ];
            const vPayments = await this.vendorPaymentRepo.aggregate(vendorPipeline).toArray();
            allPayments.push(...vPayments);

            // Sort and Paginate
            allPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const total = allPayments.length;

            if (limit === -1) {
                return response(res, StatusCodes.OK, "Payment reports fetched successfully", allPayments);
            }

            const data = allPayments.slice(page * limit, (page + 1) * limit);
            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/sales")
    async salesReport(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const search = query.search?.trim();
            const fromDate = query.fromDate;
            const toDate = query.toDate;

            const match: any = { isDelete: { $ne: 1 }, orderStatus: { $nin: ["Cancelled", "Return"] } };

            if (fromDate || toDate) {
                match.createdAt = {};
                if (fromDate) match.createdAt["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    match.createdAt["$lte"] = tDate;
                }
            }

            if (search) {
                match.orderId = { $regex: search, $options: "i" };
            }

            if (limit === -1) {
                const data = await this.orderRepo.find({
                    where: match,
                    order: { createdAt: "DESC" }
                });
                return response(res, StatusCodes.OK, "Sales reports fetched successfully", data);
            }

            const skip = page * limit;
            const [orders, total] = await this.orderRepo.findAndCount({
                where: match,
                order: { createdAt: "DESC" },
                take: limit,
                skip: skip
            });

            return pagination(total, orders, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/stock")
    async stockReport(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const productId = query.productId;
            const fromDate = query.fromDate;
            const toDate = query.toDate;

            const stockLogRepo = AppDataSource.getMongoRepository(StockLog);

            const match: any = { isDelete: { $ne: 1 } };

            if (productId) {
                match.productId = new ObjectId(productId);
            }

            if (fromDate || toDate) {
                match.createdAt = {};
                if (fromDate) match.createdAt["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    match.createdAt["$lte"] = tDate;
                }
            }

            const pipeline: any[] = [
                { $match: match },
                {
                    $lookup: {
                        from: "orders",
                        localField: "referenceId",
                        foreignField: "_id",
                        as: "orderData"
                    }
                },
                {
                    $lookup: {
                        from: "purchase_orders",
                        localField: "referenceId",
                        foreignField: "_id",
                        as: "purchaseData"
                    }
                },
                {
                    $lookup: {
                        from: "admins",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "adminData"
                    }
                },
                {
                    $lookup: {
                        from: "adminusers",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "adminUserData"
                    }
                },
                {
                    $lookup: {
                        from: "customers",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "customerData"
                    }
                },
                {
                    $addFields: {
                        createdByName: {
                            $ifNull: [
                                { $arrayElemAt: ["$adminData.name", 0] },
                                { $ifNull: [
                                    { $arrayElemAt: ["$adminUserData.name", 0] },
                                    { $ifNull: [
                                        { $arrayElemAt: ["$customerData.fullName", 0] },
                                        "System"
                                    ]}
                                ]}
                            ]
                        },
                        referenceLabel: {
                            $switch: {
                                branches: [
                                    {
                                        case: { $eq: ["$referenceModel", "Order"] },
                                        then: { $arrayElemAt: ["$orderData.invoiceId", 0] }
                                    },
                                    {
                                        case: { $eq: ["$referenceModel", "PurchaseOrder"] },
                                        then: { $arrayElemAt: ["$purchaseData.orderId", 0] }
                                    },
                                    {
                                        case: { $eq: ["$referenceModel", "Product"] },
                                        then: "Initial Upload"
                                    }
                                ],
                                default: "$referenceId"
                            }
                        }
                    }
                },
                { $sort: { createdAt: -1 } }
            ];

            if (limit !== -1) {
                pipeline.push(
                    {
                        $facet: {
                            data: [{ $skip: page * limit }, { $limit: limit }],
                            meta: [{ $count: "total" }]
                        }
                    }
                );
            }

            const result = await stockLogRepo.aggregate(pipeline).toArray();

            if (limit === -1) {
                return response(res, StatusCodes.OK, "Stock reports fetched successfully", result);
            }

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
