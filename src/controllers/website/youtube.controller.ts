import { Get, JsonController, QueryParam, Res } from "routing-controllers";
import { Response } from "express";
import { AppDataSource } from "../../data-source";
import { Youtube } from "../../entity/Youtube";
import { handleErrorResponse, pagination } from "../../utils";

@JsonController("/youtube")
export class WebsiteYoutubeController {
    private repo = AppDataSource.getMongoRepository(Youtube);

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
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
