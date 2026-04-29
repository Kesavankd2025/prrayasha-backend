import { Get, JsonController, QueryParam, Res } from "routing-controllers";
import { Response } from "express";
import { AppDataSource } from "../../data-source";
import { Advertisement } from "../../entity/Advertisement";
import { handleErrorResponse, pagination } from "../../utils";

@JsonController("/advertisement")
export class WebsiteAdvertisementController {
    private repo = AppDataSource.getMongoRepository(Advertisement);

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @Res() res: Response
    ) {
        try {
            const match: any = { status: true, isDelete: 0 };

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
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
