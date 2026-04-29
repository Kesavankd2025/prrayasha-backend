import { Post, Body, Req, Res, UseBefore, JsonController, Put, Param, Get, Delete, QueryParam } from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { Coupon } from "../../entity/Coupon";
import { CreateCouponDto, UpdateCouponDto } from "../../dto/admin/coupon.dto";
import { handleErrorResponse, pagination, response } from "../../utils";
import { Request, Response } from "express";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/coupons")
export class AdminCouponController {
    private repo = AppDataSource.getMongoRepository(Coupon);

    @Post("/create")
    async create(
        @Req() req: RequestWithUser,
        @Body() body: CreateCouponDto,
        @Res() res: Response
    ) {
        try {
            // Uniqueness check
            const exists = await this.repo.findOneBy({ code: body.code, isDelete: 0 });
            if (exists) return response(res, StatusCodes.BAD_REQUEST, "Coupon code already exists");

            // Date validation
            if (new Date(body.startDate) > new Date(body.endDate)) {
                return response(res, StatusCodes.BAD_REQUEST, "End date must be greater than start date");
            }

            const doc = new Coupon();
            Object.assign(doc, body);
            
            // Handle ObjectId conversions for specific fields
            if (body.categoryIds) doc.categoryIds = body.categoryIds.map(id => new ObjectId(id));
            if (body.productIds) doc.productIds = body.productIds.map(id => new ObjectId(id));
            if (body.specificUserIds) doc.specificUserIds = body.specificUserIds.map(id => new ObjectId(id));
            if (body.excludedProductIds) doc.excludedProductIds = body.excludedProductIds.map(id => new ObjectId(id));
            if (body.excludedCategoryIds) doc.excludedCategoryIds = body.excludedCategoryIds.map(id => new ObjectId(id));

            doc.startDate = new Date(body.startDate);
            doc.endDate = new Date(body.endDate);
            doc.isDelete = 0;
            doc.createdBy = new ObjectId(req.user.userId);
            doc.createdAt = new Date();

            await this.repo.save(doc);

            return response(res, StatusCodes.CREATED, "Coupon created successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/edit/:id")
    async edit(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Body() body: UpdateCouponDto,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Coupon not found");

            // Uniqueness check if code is changing
            if (body.code && body.code !== doc.code) {
                const exists = await this.repo.findOneBy({ code: body.code, isDelete: 0 });
                if (exists) return response(res, StatusCodes.BAD_REQUEST, "Coupon code already exists");
            }

            // Date validation
            const start = body.startDate ? new Date(body.startDate) : doc.startDate;
            const end = body.endDate ? new Date(body.endDate) : doc.endDate;
            if (start > end) {
                return response(res, StatusCodes.BAD_REQUEST, "End date must be greater than start date");
            }

            // Exclude id and _id from body before assigning to avoid overwriting primary key with a string
            const { id: _, _id: __, ...updateData } = body as any;
            Object.assign(doc, updateData);

            // Handle ObjectId conversions for specific fields
            if (body.categoryIds) doc.categoryIds = body.categoryIds.map(id => new ObjectId(id));
            if (body.productIds) doc.productIds = body.productIds.map(id => new ObjectId(id));
            if (body.specificUserIds) doc.specificUserIds = body.specificUserIds.map(id => new ObjectId(id));
            if (body.excludedProductIds) doc.excludedProductIds = body.excludedProductIds.map(id => new ObjectId(id));
            if (body.excludedCategoryIds) doc.excludedCategoryIds = body.excludedCategoryIds.map(id => new ObjectId(id));

            if (body.startDate) doc.startDate = new Date(body.startDate);
            if (body.endDate) doc.endDate = new Date(body.endDate);

            doc.updatedBy = new ObjectId(req.user.userId);
            doc.updatedAt = new Date();

            await this.repo.save(doc);
            return response(res, StatusCodes.OK, "Coupon updated successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @QueryParam("search") search: string,
        @QueryParam("status") status: boolean,
        @Res() res: Response
    ) {
        try {
            const match: any = { isDelete: 0 };
            if (status !== undefined) match.status = String(status) === 'true';
            if (search) {
                match.$or = [{ code: { $regex: search, $options: "i" } }, { title: { $regex: search, $options: "i" } }];
            }

            const pipeline: any[] = [
                { $match: match },
                { $sort: { createdAt: -1 } },
                {
                    $facet: {
                        data: [{ $skip: page * limit }, { $limit: limit }],
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const result = await this.repo.aggregate(pipeline).toArray();
            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:id")
    async details(@Param("id") id: string, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Coupon not found");

            return response(res, StatusCodes.OK, "Details fetched successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Delete("/delete/:id")
    async delete(@Param("id") id: string, @Req() req: RequestWithUser, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Coupon not found");

            doc.isDelete = 1;
            doc.updatedBy = new ObjectId(req.user.userId);
            doc.updatedAt = new Date();
            await this.repo.save(doc);

            return response(res, StatusCodes.OK, "Coupon deleted successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/:id/toggle-status")
    async statusUpdate(@Param("id") id: string, @Req() req: RequestWithUser, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Coupon not found");

            doc.status = !doc.status;
            doc.updatedBy = new ObjectId(req.user.userId);
            doc.updatedAt = new Date();
            await this.repo.save(doc);

            return response(res, StatusCodes.OK, "Status updated successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
