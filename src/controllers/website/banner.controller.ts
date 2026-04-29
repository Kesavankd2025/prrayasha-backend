import { Get, JsonController, QueryParam, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { Banner } from "../../entity/Banner";
import { handleErrorResponse, response } from "../../utils";

@JsonController("/banner")
export class WebsiteBannerController {
    private bannerRepo = AppDataSource.getMongoRepository(Banner);

    @Get("/list")
    async list(@QueryParam("pageName") pageName: string, @Res() res: Response) {
        try {
            const query: any = {
                status: true,
                isDelete: 0
            };

            if (pageName) {
                query.pageName = pageName;
            }

            const banners = await this.bannerRepo.find({
                where: query,
                order: { createdAt: "DESC" }
            });

            // Map link to url to match user request, but keep original structure too
            const result = banners.map(banner => ({
                ...banner,
                url: banner.link
            }));

            return response(res, StatusCodes.OK, "Banners fetched successfully", result);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
