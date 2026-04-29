import { Get, JsonController, Param, QueryParam, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Blog } from "../../entity/Blog";
import { handleErrorResponse, pagination, response } from "../../utils";

@JsonController("/blog")
export class WebsiteBlogController {
    private repo = AppDataSource.getMongoRepository(Blog);

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @QueryParam("search") search: string,
        @Res() res: Response
    ) {
        try {
            const match: any = { status: true, isDelete: 0 };

            if (search) {
                match.$or = [
                    { title: { $regex: search, $options: "i" } },
                    { slug: { $regex: search, $options: "i" } },
                    { description: { $regex: search, $options: "i" } }
                ];
            }

            const pipeline: any[] = [
                { $match: match },
                { $sort: { publishDate: -1, createdAt: -1 } },
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
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:slug")
    async details(@Param("slug") slug: string, @Res() res: Response) {
        try {
            const blog = await this.repo.findOneBy({ slug, status: true, isDelete: 0 });
            if (!blog) {
                return response(res, StatusCodes.NOT_FOUND, "Blog not found");
            }
            return response(res, StatusCodes.OK, "Blog details fetched successfully", blog);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/recent")
    async recent(@QueryParam("limit") limit: number = 3, @Res() res: Response) {
        try {
            const blogs = await this.repo.find({
                where: { status: true, isDelete: 0 },
                order: { publishDate: "DESC", createdAt: "DESC" },
                take: limit
            });
            return response(res, StatusCodes.OK, "Recent blogs fetched successfully", blogs);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
