import { JsonController, Get, QueryParam, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { Attribute } from "../../entity/Attribute";
import { handleErrorResponse, response } from "../../utils";

@JsonController("/attribute")
export class WebsiteAttributeController {
    private repo = AppDataSource.getMongoRepository(Attribute);

    @Get("/list")
    async list(
        @QueryParam("name") name: string,
        @Res() res: Response
    ) {
        try {
            const match: any = { isDelete: 0, status: true };
            if (name) {
                // If name is provided via query param, filter by that specific name (e.g. Color)
                match.name = { $regex: new RegExp(`^${name}$`, "i") };
            }

            const attributes = await this.repo.find({
                where: match,
                order: { createdAt: -1 }
            });

            // Format for website frontend filters
            const formattedData = attributes.map(attr => ({
                id: attr.id,
                name: attr.name,
                displayName: attr.displayName || attr.name,
                values: attr.values || []
            }));

            return response(res, StatusCodes.OK, "Attributes fetched successfully", formattedData);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
