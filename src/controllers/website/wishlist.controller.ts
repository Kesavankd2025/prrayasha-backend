import { Body, Delete, Get, JsonController, Param, Post, QueryParam, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Wishlist } from "../../entity/Wishlist";
import { Product } from "../../entity/Product";
import { Cart } from "../../entity/Cart";
import { handleErrorResponse, response } from "../../utils";

@JsonController("/wishlist")
export class WebsiteWishlistController {
    private repo = AppDataSource.getMongoRepository(Wishlist);
    private productRepo = AppDataSource.getMongoRepository(Product);
    private cartRepo = AppDataSource.getMongoRepository(Cart);

    private generateGuestId(): string {
        return "GUEST_WL_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    @Post("/add")
    async addToWishlist(
        @Body() body: {
            userId?: string;
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
            const { userId, productId, combination } = body;
            let guestId = body.guestId;

            if (!userId && !guestId) {
                guestId = this.generateGuestId();
            }

            // 1. Validate Product
            const product = await this.productRepo.findOneBy({ _id: new ObjectId(productId), status: true, isDelete: 0 });
            if (!product) {
                return response(res, StatusCodes.NOT_FOUND, "Product not found or inactive");
            }

            // 2. Format combination
            const formattedCombination = combination?.map(c => ({
                attributeId: new ObjectId(c.attributeId),
                valueId: new ObjectId(c.valueId),
                value: c.value
            }));

            // 3. Check if already in wishlist
            const query: any = {
                productId: new ObjectId(productId)
            };
            if (formattedCombination) query.combination = formattedCombination;
            else query.combination = null;

            if (userId) {
                query.userId = new ObjectId(userId);
            } else {
                query.guestId = guestId;
            }

            const existing = await this.repo.findOneBy(query);

            if (existing) {
                return response(res, StatusCodes.BAD_REQUEST, "Item already in wishlist", { guestId: userId ? null : guestId });
            }

            // 4. Save new
            const newItem = new Wishlist();
            newItem.productId = new ObjectId(productId);
            newItem.combination = formattedCombination;
            if (userId) {
                newItem.userId = new ObjectId(userId);
            } else {
                newItem.guestId = guestId;
            }

            await this.repo.save(newItem);
            return response(res, StatusCodes.CREATED, "Product added to wishlist", { item: newItem, guestId: userId ? null : guestId });
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/list")
    async list(
        @QueryParam("userId") userId: string,
        @QueryParam("guestId") guestId: string,
        @Res() res: Response
    ) {
        try {
            if (!userId && !guestId) {
                return response(res, StatusCodes.BAD_REQUEST, "userId or guestId is required");
            }

            const match: any = {};
            if (userId) {
                match.userId = new ObjectId(userId);
            } else {
                match.guestId = guestId;
            }

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
                { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } }
            ];

            const items = await this.repo.aggregate(pipeline).toArray();
            return response(res, StatusCodes.OK, "Wishlist fetched", items);
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
            const item = await this.repo.findOneBy({ _id: new ObjectId(id) });
            if (!item) {
                return response(res, StatusCodes.NOT_FOUND, "Wishlist item not found");
            }
            await this.repo.remove(item);
            return response(res, StatusCodes.OK, "Removed from wishlist");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Delete("/clear")
    async clear(
        @QueryParam("userId") userId: string,
        @QueryParam("guestId") guestId: string,
        @Res() res: Response
    ) {
        try {
            if (!userId && !guestId) {
                return response(res, StatusCodes.BAD_REQUEST, "userId or guestId is required");
            }

            const query: any = {};
            if (userId) {
                query.userId = new ObjectId(userId);
            } else {
                query.guestId = guestId;
            }

            await this.repo.deleteMany(query);
            return response(res, StatusCodes.OK, "Wishlist cleared successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/move-to-cart")
    async moveToCart(
        @Body() body: {
            wishlistId: string;
            qty: number;
        },
        @Res() res: Response
    ) {
        try {
            const wishlistId = new ObjectId(body.wishlistId);
            const item = await this.repo.findOneBy({ _id: wishlistId });

            if (!item) {
                return response(res, StatusCodes.NOT_FOUND, "Wishlist item not found");
            }

            // Check if already in cart
            const cartQuery: any = {
                productId: item.productId,
                combination: item.combination || null
            };
            if (item.userId) cartQuery.userId = item.userId;
            else cartQuery.guestId = item.guestId;

            const existingCart = await this.cartRepo.findOneBy(cartQuery);

            if (existingCart) {
                existingCart.qty += Number(body.qty || 1);
                await this.cartRepo.save(existingCart);
            } else {
                const cartItem = new Cart();
                cartItem.productId = item.productId;
                cartItem.userId = item.userId;
                cartItem.guestId = item.guestId;
                cartItem.combination = item.combination;
                cartItem.qty = Number(body.qty || 1);
                await this.cartRepo.save(cartItem);
            }

            // Remove from wishlist after moving to cart
            await this.repo.remove(item);

            return response(res, StatusCodes.OK, "Item moved to cart successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
