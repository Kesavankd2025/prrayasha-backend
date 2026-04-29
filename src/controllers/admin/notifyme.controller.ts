import { Body, Delete, Get, JsonController, Param, Post, Put, QueryParam, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { NotifyMe } from "../../entity/NotifyMe";
import { handleErrorResponse, response } from "../../utils";

@JsonController("/notifyme")
export class AdminNotifyMeController {
    private repo = AppDataSource.getMongoRepository(NotifyMe);

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("rowsPerPage") rowsPerPage: number = 10,
        @QueryParam("productId") productId: string,
        @QueryParam("startDate") startDate: string,
        @QueryParam("endDate") endDate: string,
        @Res() res: Response
    ) {
        try {
            const match: any = {};

            if (productId) {
                match.productId = new ObjectId(productId);
            }

            if (startDate || endDate) {
                match.createdAt = {};
                if (startDate) {
                    const start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    match.createdAt.$gte = start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    match.createdAt.$lte = end;
                }
            }

            const skip = Number(page) * Number(rowsPerPage);
            const limit = Number(rowsPerPage);

            const pipeline: any[] = [
                { $match: match },
                {
                    $lookup: {
                        from: "products",
                        localField: "productId",
                        foreignField: "_id",
                        as: "product"
                    }
                },
                { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "customers",
                        localField: "userId",
                        foreignField: "_id",
                        as: "customer"
                    }
                },
                { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
                { $sort: { createdAt: -1 } },
                {
                    $facet: {
                        data: [
                            { $skip: skip },
                            { $limit: limit }
                        ],
                        totalCount: [
                            { $count: "count" }
                        ]
                    }
                }
            ];

            const result = await this.repo.aggregate(pipeline).toArray();
            const data = result[0].data || [];
            const total = result[0].totalCount[0]?.count || 0;

            return response(res, StatusCodes.OK, "Notify requests list fetched", {
                data,
                total,
                page: Number(page),
                rowsPerPage: Number(rowsPerPage)
            });
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Delete("/remove/:id")
    async remove(
        @Param("id") id: string,
        @Res() res: Response
    ) {
        try {
            const notifyRequest = await this.repo.findOneBy({ _id: new ObjectId(id) });
            if (!notifyRequest) {
                return response(res, StatusCodes.NOT_FOUND, "Notify request not found");
            }
            await this.repo.remove(notifyRequest);
            return response(res, StatusCodes.OK, "Notify request removed");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
