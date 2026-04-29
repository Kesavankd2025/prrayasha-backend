import { Body, Delete, Get, JsonController, Param, Post, Put, QueryParam, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Cart } from "../../entity/Cart";
import { Product } from "../../entity/Product";
import { handleErrorResponse, response } from "../../utils";

@JsonController("/cart")
export class WebsiteCartController {
    private repo = AppDataSource.getMongoRepository(Cart);
    private productRepo = AppDataSource.getMongoRepository(Product);

    private generateGuestId(): string {
        return "GUEST_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    @Post("/add")
    async addToCart(
        @Body() body: {
            userId?: string;
            guestId?: string;
            productId: string;
            qty: number;
            combination?: {
                attributeId: string;
                valueId: string;
                value: string;
            }[];
        },
        @Res() res: Response
    ) {
        try {
            const { userId, productId, qty, combination } = body;
            let guestId = body.guestId;

            // 1. Handle Guest ID generation if neither userId nor guestId is provided
            if (!userId && !guestId) {
                guestId = this.generateGuestId();
            }

            // 2. Validate Product
            const product = await this.productRepo.findOneBy({ _id: new ObjectId(productId), status: true, isDelete: 0 });
            if (!product) {
                return response(res, StatusCodes.NOT_FOUND, "Product not found or inactive");
            }

            // 3. Prepare combination with ObjectId
            const formattedCombination = combination?.map(c => ({
                attributeId: new ObjectId(c.attributeId),
                valueId: new ObjectId(c.valueId),
                value: c.value
            }));

            // 4. Check if item already exists in cart for this user/guest
            const query: any = {
                productId: new ObjectId(productId),
                combination: formattedCombination || null
            };

            if (userId) {
                query.userId = new ObjectId(userId);
            } else {
                query.guestId = guestId;
            }

            const existingCartItem = await this.repo.findOneBy(query);

            if (existingCartItem) {
                // Update quantity
                existingCartItem.qty += Number(qty);
                await this.repo.save(existingCartItem);
                return response(res, StatusCodes.OK, "Cart updated", { cartItem: existingCartItem, guestId: userId ? null : guestId });
            } else {
                // Create new cart item
                const newCartItem = new Cart();
                newCartItem.productId = new ObjectId(productId);
                newCartItem.qty = Number(qty);
                newCartItem.combination = formattedCombination;
                if (userId) {
                    newCartItem.userId = new ObjectId(userId);
                } else {
                    newCartItem.guestId = guestId;
                }

                await this.repo.save(newCartItem);
                return response(res, StatusCodes.OK, "Product added to cart", { cartItem: newCartItem, guestId: userId ? null : guestId });
            }
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

            const cartItems = await this.repo.aggregate(pipeline).toArray();
            return response(res, StatusCodes.OK, "Cart list fetched", cartItems);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/update-qty/:id")
    async updateQty(
        @Param("id") id: string,
        @Body() body: { qty: number },
        @Res() res: Response
    ) {
        try {
            const { qty } = body;
            const cartItem = await this.repo.findOneBy({ _id: new ObjectId(id) });
            if (!cartItem) {
                return response(res, StatusCodes.NOT_FOUND, "Cart item not found");
            }

            if (Number(qty) <= 0) {
                await this.repo.remove(cartItem);
                return response(res, StatusCodes.OK, "Item removed from cart as quantity was 0");
            }

            // --- Stock Validation ---
            const product = await this.productRepo.findOneBy({ _id: cartItem.productId, isDelete: 0 });
            if (!product) {
                return response(res, StatusCodes.NOT_FOUND, "Associated product not found");
            }

            if (product.attributes && Array.isArray(product.attributes)) {
                // Find the matching combination in product attributes
                const matchingAttribute = product.attributes.find((attr: any) => {
                    const productComb = attr.combination || [];
                    const cartComb = cartItem.combination || [];

                    if (productComb.length !== cartComb.length) return false;

                    // Compare each attribute/value pair
                    return cartComb.every((c: any) => 
                        productComb.some((pc: any) => 
                            pc.attributeId.toString() === c.attributeId.toString() && 
                            pc.valueId.toString() === c.valueId.toString()
                        )
                    );
                });

                if (matchingAttribute) {
                    if (Number(qty) > Number(matchingAttribute.stock)) {
                        return response(res, StatusCodes.BAD_REQUEST, `Only ${matchingAttribute.stock} items available in stock`);
                    }
                } else if (product.attributes.length > 0) {
                    // If product has variations but we didn't find a match for this cart item
                    return response(res, StatusCodes.BAD_REQUEST, "Selected product variation is no longer available");
                }
            }
            // --- End Stock Validation ---

            cartItem.qty = Number(qty);
            await this.repo.save(cartItem);
            return response(res, StatusCodes.OK, "Quantity updated", cartItem);
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
            const cartItem = await this.repo.findOneBy({ _id: new ObjectId(id) });
            if (!cartItem) {
                return response(res, StatusCodes.NOT_FOUND, "Cart item not found");
            }
            await this.repo.remove(cartItem);
            return response(res, StatusCodes.OK, "Item removed from cart");
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
            return response(res, StatusCodes.OK, "Cart cleared successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
