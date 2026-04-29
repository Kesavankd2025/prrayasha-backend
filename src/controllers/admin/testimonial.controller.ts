import { Post, Body, Req, Res, UseBefore, JsonController, Put, Param, Get, Delete, QueryParam } from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { Testimonial } from "../../entity/Testimonial";
import { CreateTestimonialDto, UpdateTestimonialDto } from "../../dto/admin/testimonial.dto";
import { handleErrorResponse, pagination, response } from "../../utils";
import { Request, Response } from "express";

interface RequestWithFiles extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/testimonial")
export class TestimonialController {
    private repo = AppDataSource.getMongoRepository(Testimonial);

    @Post("/create")
    async create(
        @Req() req: RequestWithFiles,
        @Body() body: CreateTestimonialDto,
        @Res() res: Response
    ) {
        try {
            const doc = new Testimonial();
            if (body.clientName !== undefined) doc.clientName = body.clientName;
            if (body.title !== undefined) doc.title = body.title;
            if (body.message !== undefined) doc.message = body.message;
            if (body.rating !== undefined) doc.rating = body.rating;
            if (body.status !== undefined) doc.status = body.status;

            if (body.displayOrder !== undefined && body.displayOrder > 0) {
                await this.repo.updateMany(
                    { displayOrder: { $gte: body.displayOrder }, isDelete: 0 },
                    { $inc: { displayOrder: 1 } }
                );
                doc.displayOrder = body.displayOrder;
            } else {
                const last = await this.repo.findOne({ where: { isDelete: 0 }, order: { displayOrder: -1 } });
                doc.displayOrder = (last?.displayOrder || 0) + 1;
            }

            doc.isDelete = 0;
            doc.createdAt = new Date();

            await this.repo.save(doc);
            return response(res, StatusCodes.CREATED, "Testimonial created successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/edit/:id")
    async edit(
        @Param("id") id: string,
        @Req() req: RequestWithFiles,
        @Body() body: UpdateTestimonialDto,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Testimonial not found");

            if (body.clientName !== undefined) doc.clientName = body.clientName;
            if (body.title !== undefined) doc.title = body.title;
            if (body.message !== undefined) doc.message = body.message;
            if (body.rating !== undefined) doc.rating = body.rating;
            if (body.status !== undefined) doc.status = body.status;

            if (body.displayOrder !== undefined && body.displayOrder !== doc.displayOrder && body.displayOrder > 0) {
                await this.repo.updateMany(
                    { _id: { $ne: doc.id }, displayOrder: { $gte: body.displayOrder }, isDelete: 0 },
                    { $inc: { displayOrder: 1 } }
                );
                doc.displayOrder = body.displayOrder;
            }

            doc.updatedAt = new Date();

            await this.repo.save(doc);
            return response(res, StatusCodes.OK, "Testimonial updated successfully", doc);
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
                match.$or = [
                    { clientName: { $regex: search, $options: "i" } },
                    { title: { $regex: search, $options: "i" } },
                    { message: { $regex: search, $options: "i" } }
                ];
            }

            const pipeline: any[] = [
                { $match: match },
                { $sort: { displayOrder: 1, createdAt: -1 } },
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
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Testimonial not found");

            return response(res, StatusCodes.OK, "Details fetched successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Delete("/delete/:id")
    async delete(@Param("id") id: string, @Req() req: RequestWithFiles, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Testimonial not found");

            doc.isDelete = 1;
            doc.updatedAt = new Date();
            await this.repo.save(doc);

            return response(res, StatusCodes.OK, "Testimonial deleted successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
