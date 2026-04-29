import { Body, JsonController, Post, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { NotifyMe } from "../../entity/NotifyMe";
import { Product } from "../../entity/Product";
import { handleErrorResponse, response } from "../../utils";

@JsonController("/notifyme")
export class WebsiteNotifyMeController {
    private repo = AppDataSource.getMongoRepository(NotifyMe);
    private productRepo = AppDataSource.getMongoRepository(Product);

    @Post("/add")
    async add(
        @Body() body: {
            userId?: string;
            email?: string;
            guestId?: string;
            productId: string;
            combination?: {
                attributeId: string;
                valueId: string;
                value: string;
            }[];
        },
        @Res() res: Response
    ) {
        try {
            const { userId, email, guestId, productId, combination } = body;

            // 1. Validate Product
            const product = await this.productRepo.findOneBy({ _id: new ObjectId(productId), status: true, isDelete: 0 });
            if (!product) {
                return response(res, StatusCodes.NOT_FOUND, "Product not found or inactive");
            }

            // 2. Prepare combination with ObjectId
            const formattedCombination = combination?.map(c => ({
                attributeId: new ObjectId(c.attributeId),
                valueId: new ObjectId(c.valueId),
                value: c.value
            })) || null;

            // 3. Check if notification request already exists
            const query: any = {
                productId: new ObjectId(productId),
                combination: formattedCombination
            };

            if (userId) {
                query.userId = new ObjectId(userId);
            } else if (email) {
                query.email = email;
            } else if (guestId) {
                query.guestId = guestId;
            } else {
                return response(res, StatusCodes.BAD_REQUEST, "userId, email or guestId is required");
            }

            const existingNotifyRequest = await this.repo.findOneBy(query);

            if (existingNotifyRequest) {
                return response(res, StatusCodes.OK, "You have already requested to be notified for this product");
            }

            // 4. Create new notification request
            const newNotifyRequest = new NotifyMe();
            newNotifyRequest.productId = new ObjectId(productId);
            newNotifyRequest.combination = formattedCombination;
            newNotifyRequest.status = "pending";
            
            if (userId) {
                newNotifyRequest.userId = new ObjectId(userId);
            }
            if (email) {
                newNotifyRequest.email = email;
            }
            if (guestId) {
                newNotifyRequest.guestId = guestId;
            }

            await this.repo.save(newNotifyRequest);
            return response(res, StatusCodes.OK, "We will notify you once the product is back in stock", newNotifyRequest);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
