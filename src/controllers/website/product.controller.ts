import { Get, JsonController, Param, QueryParam, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Product } from "../../entity/Product";
import { Attribute } from "../../entity/Attribute";
import { handleErrorResponse, pagination, response } from "../../utils";

@JsonController("/product")
export class WebsiteProductController {
    private repo = AppDataSource.getMongoRepository(Product);
    private attributeRepo = AppDataSource.getMongoRepository(Attribute);

    private async mapAttributeDetails(data: any[]) {
        const attributes = await this.attributeRepo.find({ where: { status: true, isDelete: 0 } });
        
        return data.map(product => {
            if (product.attributes && Array.isArray(product.attributes)) {
                product.attributes = product.attributes.map((attr: any) => {
                    if (attr.combination && Array.isArray(attr.combination)) {
                        attr.combination = attr.combination.map((comb: any) => {
                            const foundAttr = attributes.find(a => a.id.toString() === comb.attributeId.toString());
                            if (foundAttr) {
                                comb.attributeName = foundAttr.name;
                                comb.displayName = foundAttr.displayName;
                                // Handle potential image for specific attribute values (e.g. colors)
                                const valDetails = foundAttr.values?.find(v => v.name === comb.value);
                                if (valDetails) {
                                    comb.valueImage = valDetails.image;
                                }
                            }
                            return comb;
                        });
                    }
                    return attr;
                });
            }
            return product;
        });
    }

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 20,
        @QueryParam("search") search: string,
        @QueryParam("categoryId") categoryId: string,
        @QueryParam("subCategoryId") subCategoryId: string,
        @QueryParam("brandId") brandId: string,
        @QueryParam("minPrice") minPrice: number,
        @QueryParam("maxPrice") maxPrice: number,
        @QueryParam("isFeatured") isFeatured: boolean,
        @QueryParam("isFutureProduct") isFutureProduct: boolean,
        @QueryParam("isNewArrival") isNewArrival: boolean,
        @QueryParam("attributeId") attributeId: string,
        @QueryParam("valueId") valueId: string,
        @QueryParam("filters") filters: string,
        @QueryParam("sortBy") sortBy: string = "createdAt", // "price_low", "price_high", "createdAt"
        @Res() res: Response
    ) {
        try {
            const match: any = { status: true, isDelete: 0 };

            if (search) {
                match.$or = [
                    { name: { $regex: search, $options: "i" } },
                    { slug: { $regex: search, $options: "i" } },
                    { shortDescription: { $regex: search, $options: "i" } }
                ];
            }

            if (categoryId) match.categoryId = new ObjectId(categoryId);
            if (subCategoryId) match.subCategoryId = new ObjectId(subCategoryId);
            if (brandId) match.brandId = new ObjectId(brandId);

            if (isFeatured !== undefined) {
                match.isFeatured = String(isFeatured) === "true";
            }
            if (isFutureProduct !== undefined) {
                match.isFutureProduct = String(isFutureProduct) === "true";
            }
            if (isNewArrival !== undefined) {
                match.isNewArrival = String(isNewArrival) === "true";
            }

            if (minPrice !== undefined || maxPrice !== undefined) {
                match["attributes.price"] = {};
                if (minPrice !== undefined) match["attributes.price"].$gte = Number(minPrice);
                if (maxPrice !== undefined) match["attributes.price"].$lte = Number(maxPrice);
            }

            // Handle Multiple Filters
            if (filters) {
                try {
                    const parsedFilters = JSON.parse(filters);
                    const filterCriteria: any[] = [];

                    for (const [attrId, valueIds] of Object.entries(parsedFilters)) {
                        if (Array.isArray(valueIds) && valueIds.length > 0) {
                            filterCriteria.push({
                                $elemMatch: {
                                    attributeId: attrId,
                                    valueId: { $in: valueIds }
                                }
                            });
                        }
                    }

                    if (filterCriteria.length > 0) {
                        match["attributes"] = {
                            $elemMatch: {
                                "combination": {
                                    $all: filterCriteria
                                }
                            }
                        };
                    }
                } catch (error) {
                    console.error("Filter parsing error:", error);
                }
            } else if (attributeId || valueId) {
                // Existing single attribute/value filter for backward compatibility
                const criteria: any = {};
                if (attributeId) criteria.attributeId = attributeId;
                if (valueId) criteria.valueId = valueId;

                match["attributes"] = {
                    $elemMatch: {
                        "combination": {
                            $elemMatch: criteria
                        }
                    }
                };
            }

            const sort: any = {};
            if (sortBy === "price_low") sort["attributes.price"] = 1;
            else if (sortBy === "price_high") sort["attributes.price"] = -1;
            else sort[sortBy] = -1;

            const pipeline: any[] = [
                { $match: match },
                { $sort: sort },
                {
                    $lookup: {
                        from: "categories",
                        localField: "categoryId",
                        foreignField: "_id",
                        as: "category"
                    }
                },
                { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "sub-categories",
                        localField: "subCategoryId",
                        foreignField: "_id",
                        as: "subCategory"
                    }
                },
                { $unwind: { path: "$subCategory", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "brands",
                        localField: "brandId",
                        foreignField: "_id",
                        as: "brand"
                    }
                },
                { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "units",
                        localField: "unitId",
                        foreignField: "_id",
                        as: "unit"
                    }
                },
                { $unwind: { path: "$unit", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "taxes",
                        localField: "taxId",
                        foreignField: "_id",
                        as: "tax"
                    }
                },
                { $unwind: { path: "$tax", preserveNullAndEmptyArrays: true } },
                {
                    $facet: {
                        data: [{ $skip: page * limit }, { $limit: limit }],
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const result = await this.repo.aggregate(pipeline).toArray();
            let data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            // Map attribute names and value details (images)
            data = await this.mapAttributeDetails(data);

            return pagination(total, data, limit, page, res);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:slug")
    async details(@Param("slug") slug: string, @Res() res: Response) {
        try {
            const pipeline: any[] = [
                { $match: { slug, status: true, isDelete: 0 } },
                {
                    $lookup: {
                        from: "categories",
                        localField: "categoryId",
                        foreignField: "_id",
                        as: "category"
                    }
                },
                { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "sub-categories",
                        localField: "subCategoryId",
                        foreignField: "_id",
                        as: "subCategory"
                    }
                },
                { $unwind: { path: "$subCategory", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "brands",
                        localField: "brandId",
                        foreignField: "_id",
                        as: "brand"
                    }
                },
                { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "units",
                        localField: "unitId",
                        foreignField: "_id",
                        as: "unit"
                    }
                },
                { $unwind: { path: "$unit", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "taxes",
                        localField: "taxId",
                        foreignField: "_id",
                        as: "tax"
                    }
                },
                { $unwind: { path: "$tax", preserveNullAndEmptyArrays: true } }
            ];

            const result = await this.repo.aggregate(pipeline).toArray();
            if (result.length === 0) {
                return response(res, StatusCodes.NOT_FOUND, "Product not found");
            }
            const product = result[0];
            const enriched = (await this.mapAttributeDetails([product]))[0];
            return response(res, StatusCodes.OK, "Product details fetched", enriched);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/related/:id")
    async related(@Param("id") id: string, @Res() res: Response) {
        try {
            const product = await this.repo.findOneBy({ _id: new ObjectId(id) });
            if (!product) return response(res, StatusCodes.NOT_FOUND, "Product not found");

            const pipeline: any[] = [
                {
                    $match: {
                        categoryId: product.categoryId,
                        _id: { $ne: product.id },
                        status: true,
                        isDelete: 0
                    }
                },
                { $limit: 4 },
                {
                    $lookup: {
                        from: "categories",
                        localField: "categoryId",
                        foreignField: "_id",
                        as: "category"
                    }
                },
                { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "sub-categories",
                        localField: "subCategoryId",
                        foreignField: "_id",
                        as: "subCategory"
                    }
                },
                { $unwind: { path: "$subCategory", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "brands",
                        localField: "brandId",
                        foreignField: "_id",
                        as: "brand"
                    }
                },
                { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "units",
                        localField: "unitId",
                        foreignField: "_id",
                        as: "unit"
                    }
                },
                { $unwind: { path: "$unit", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "taxes",
                        localField: "taxId",
                        foreignField: "_id",
                        as: "tax"
                    }
                },
                { $unwind: { path: "$tax", preserveNullAndEmptyArrays: true } }
            ];

            const result = await this.repo.aggregate(pipeline).toArray();
            const enriched = await this.mapAttributeDetails(result);
            return response(res, StatusCodes.OK, "Related products fetched", enriched);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
