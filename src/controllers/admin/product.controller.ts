import { Post, Body, Req, Res, UseBefore, JsonController, Put, Param, Get, Delete, QueryParam } from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { Product } from "../../entity/Product";
import { CreateProductDto, UpdateProductDto } from "../../dto/admin/product.dto";
import { handleErrorResponse, pagination, response } from "../../utils";
import { Request, Response } from "express";
import { logStockChange } from "../../utils/stockLogger";
import { Category } from "../../entity/Category";
import { SubCategory } from "../../entity/SubCategory";

interface RequestWithFiles extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/products")
export class ProductController {
    private repo = AppDataSource.getMongoRepository(Product);

    @Post("/create")
    async create(
        @Req() req: RequestWithFiles,
        @Body({ options: { limit: "50mb" } }) body: CreateProductDto,
        @Res() res: Response
    ) {
        try {
            const doc = new Product();
            if (body.name !== undefined) {
                const exists = await this.repo.findOne({ where: { name: { $regex: new RegExp(`^${body.name.trim()}$`, "i") }, isDelete: 0 } });
                if (exists) return response(res, StatusCodes.BAD_REQUEST, "Product with this name already exists");
                doc.name = body.name;
            }
            if (body.slug !== undefined) doc.slug = body.slug;
            if (body.categoryId) {
                const category = await AppDataSource.getMongoRepository(Category).findOneBy({ _id: new ObjectId(body.categoryId), isDelete: 0 });
                if (!category) return response(res, StatusCodes.BAD_REQUEST, "Category not found");
                if (category.status === false) return response(res, StatusCodes.BAD_REQUEST, "Selected category is inactive");
                doc.categoryId = new ObjectId(body.categoryId);
            }
            if (body.subCategoryId) {
                const subCategory = await AppDataSource.getMongoRepository(SubCategory).findOneBy({ _id: new ObjectId(body.subCategoryId), isDelete: 0 });
                if (!subCategory) return response(res, StatusCodes.BAD_REQUEST, "SubCategory not found");
                if (subCategory.status === false) return response(res, StatusCodes.BAD_REQUEST, "Selected subcategory is inactive");
                
                const parentOfSub = await AppDataSource.getMongoRepository(Category).findOneBy({ _id: subCategory.categoryId, isDelete: 0 });
                if (parentOfSub?.status === false) return response(res, StatusCodes.BAD_REQUEST, "Selected subcategory's parent category is inactive");
                doc.subCategoryId = new ObjectId(body.subCategoryId);
            }
            if (body.brandId) doc.brandId = new ObjectId(body.brandId);
            if (body.unitId) doc.unitId = new ObjectId(body.unitId);
            if (body.taxId) doc.taxId = new ObjectId(body.taxId);
            if (body.hsnCode !== undefined) doc.hsnCode = body.hsnCode;
            if (body.weight !== undefined) doc.weight = body.weight;
            if (body.shortDescription !== undefined) doc.shortDescription = body.shortDescription;
            if (body.fullDescription !== undefined) doc.fullDescription = body.fullDescription;
            if (body.refundable !== undefined) doc.refundable = body.refundable;
            if (body.status !== undefined) doc.status = body.status;
            if (body.lowStockAlert !== undefined) doc.lowStockAlert = body.lowStockAlert;
            if (body.metaTitle !== undefined) doc.metaTitle = body.metaTitle;
            if (body.metaKeywords !== undefined) doc.metaKeywords = body.metaKeywords;
            if (body.metaDescription !== undefined) doc.metaDescription = body.metaDescription;
            if (body.attributes !== undefined) doc.attributes = body.attributes;
            if (body.specifications !== undefined) doc.specifications = body.specifications;
            if (body.isFeatured !== undefined) doc.isFeatured = body.isFeatured;
            if (body.isFutureProduct !== undefined) doc.isFutureProduct = body.isFutureProduct;
            if (body.isNewArrival !== undefined) doc.isNewArrival = body.isNewArrival;

            doc.isDelete = 0;
            doc.createdBy = new ObjectId(req.user.userId);
            doc.createdAt = new Date();

            await this.repo.save(doc);

            // Log initial stock
            if (doc.attributes && Array.isArray(doc.attributes)) {
                for (const attr of doc.attributes) {
                    if (attr.stock > 0) {
                        const variantLabel = (attr.combination || [])
                            .map((c: any) => c.value)
                            .filter(Boolean)
                            .join(", ");

                        const stockLogAttributes = (attr.combination || []).map((c: any) => ({
                            attributeId: new ObjectId(c.attributeId),
                            valueId: new ObjectId(c.valueId)
                        }));

                        await logStockChange({
                            productId: doc.id,
                            productName: doc.name,
                            attributeId: attr.sku,
                            variantLabel: variantLabel,
                            previousStock: 0,
                            quantity: Number(attr.stock),
                            currentStock: Number(attr.stock),
                            type: "initial",
                            attributes: stockLogAttributes,
                            referenceModel: "Product",
                            referenceId: doc.id,
                            userId: new ObjectId(req.user.userId)
                        });
                    }
                }
            }

            return response(res, StatusCodes.CREATED, "Product created successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/edit/:id")
    async edit(
        @Param("id") id: string,
        @Req() req: RequestWithFiles,
        @Body({ options: { limit: "50mb" } }) body: UpdateProductDto,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Product not found");

            if (body.name !== undefined) {
                const exists = await this.repo.findOne({ where: { name: { $regex: new RegExp(`^${body.name.trim()}$`, "i") }, isDelete: 0, _id: { $ne: new ObjectId(id) } } });
                if (exists) return response(res, StatusCodes.BAD_REQUEST, "Product with this name already exists");
                doc.name = body.name;
            }
            if (body.slug !== undefined) doc.slug = body.slug;
            if (body.categoryId) {
                const category = await AppDataSource.getMongoRepository(Category).findOneBy({ _id: new ObjectId(body.categoryId), isDelete: 0 });
                if (!category) return response(res, StatusCodes.BAD_REQUEST, "Category not found");
                if (category.status === false) return response(res, StatusCodes.BAD_REQUEST, "Selected category is inactive");
                doc.categoryId = new ObjectId(body.categoryId);
            }
            if (body.subCategoryId) {
                const subCategory = await AppDataSource.getMongoRepository(SubCategory).findOneBy({ _id: new ObjectId(body.subCategoryId), isDelete: 0 });
                if (!subCategory) return response(res, StatusCodes.BAD_REQUEST, "SubCategory not found");
                if (subCategory.status === false) return response(res, StatusCodes.BAD_REQUEST, "Selected subcategory is inactive");
                
                const parentOfSub = await AppDataSource.getMongoRepository(Category).findOneBy({ _id: subCategory.categoryId, isDelete: 0 });
                if (parentOfSub?.status === false) return response(res, StatusCodes.BAD_REQUEST, "Selected subcategory's parent category is inactive");
                doc.subCategoryId = new ObjectId(body.subCategoryId);
            }
            if (body.brandId) doc.brandId = new ObjectId(body.brandId);
            if (body.unitId) doc.unitId = new ObjectId(body.unitId);
            if (body.taxId) doc.taxId = new ObjectId(body.taxId);
            if (body.hsnCode !== undefined) doc.hsnCode = body.hsnCode;
            if (body.weight !== undefined) doc.weight = body.weight;
            if (body.shortDescription !== undefined) doc.shortDescription = body.shortDescription;
            if (body.fullDescription !== undefined) doc.fullDescription = body.fullDescription;
            if (body.refundable !== undefined) doc.refundable = body.refundable;
            if (body.status !== undefined) doc.status = body.status;
            if (body.lowStockAlert !== undefined) doc.lowStockAlert = body.lowStockAlert;
            if (body.metaTitle !== undefined) doc.metaTitle = body.metaTitle;
            if (body.metaKeywords !== undefined) doc.metaKeywords = body.metaKeywords;
            if (body.metaDescription !== undefined) doc.metaDescription = body.metaDescription;
            if (body.attributes !== undefined) doc.attributes = body.attributes;
            if (body.specifications !== undefined) doc.specifications = body.specifications;
            if (body.isFeatured !== undefined) doc.isFeatured = body.isFeatured;
            if (body.isFutureProduct !== undefined) doc.isFutureProduct = body.isFutureProduct;
            if (body.isNewArrival !== undefined) doc.isNewArrival = body.isNewArrival;

            doc.updatedBy = new ObjectId(req.user.userId);
            doc.updatedAt = new Date();

            await this.repo.save(doc);
            return response(res, StatusCodes.OK, "Product updated successfully", doc);
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
                match.$or = [{ name: { $regex: search, $options: "i" } }, { slug: { $regex: search, $options: "i" } }];
            }

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
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:id")
    async details(@Param("id") id: string, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Product not found");

            return response(res, StatusCodes.OK, "Details fetched successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/clone/:id")
    async clone(@Param("id") id: string, @Req() req: RequestWithFiles, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const original = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!original) return response(res, StatusCodes.NOT_FOUND, "Product not found");

            const clone = new Product();
            // Object.assign(clone, original); 
            // Better to copy fields explicitly to avoid copying internal TypeORM state or ID

            const fieldsToCopy = [
                "name", "slug", "categoryId", "subCategoryId", "brandId", "unitId", 
                "taxId", "hsnCode", "weight", "shortDescription", "fullDescription", 
                "refundable", "status", "lowStockAlert", "metaTitle", "metaKeywords", 
                "metaDescription", "attributes", "specifications", "isFeatured", 
                "isFutureProduct", "isNewArrival", "productImage", "galleryImages"
            ];

            fieldsToCopy.forEach(field => {
                if (original[field] !== undefined) {
                    clone[field] = original[field];
                }
            });

            // Make name and slug unique
            let cloneName = `${original.name} (Clone)`;
            const exists = await this.repo.findOne({ where: { name: { $regex: new RegExp(`^${cloneName.trim()}$`, "i") }, isDelete: 0 } });
            if (exists) {
                cloneName = `${original.name} (Clone) - ${Date.now()}`;
            }
            clone.name = cloneName;
            clone.slug = `${original.slug}-clone-${Date.now()}`;
            
            clone.isDelete = 0;
            clone.createdBy = new ObjectId(req.user.userId);
            clone.createdAt = new Date();
            clone.updatedAt = new Date();
            clone.updatedBy = new ObjectId(req.user.userId);

            const saved = await this.repo.save(clone);

            // Log initial stock for clone if attributes exist
            if (saved.attributes && Array.isArray(saved.attributes)) {
                for (const attr of saved.attributes) {
                    if (attr.stock > 0) {
                        const variantLabel = (attr.combination || [])
                            .map((c: any) => c.value)
                            .filter(Boolean)
                            .join(", ");

                        const stockLogAttributes = (attr.combination || []).map((c: any) => ({
                            attributeId: new ObjectId(c.attributeId),
                            valueId: new ObjectId(c.valueId)
                        }));

                        await logStockChange({
                            productId: saved.id,
                            productName: saved.name,
                            attributeId: attr.sku,
                            variantLabel: variantLabel,
                            previousStock: 0,
                            quantity: Number(attr.stock),
                            currentStock: Number(attr.stock),
                            type: "initial",
                            attributes: stockLogAttributes,
                            referenceModel: "Product",
                            referenceId: saved.id,
                            userId: new ObjectId(req.user.userId)
                        });
                    }
                }
            }

            return response(res, StatusCodes.CREATED, "Product cloned successfully", saved);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Delete("/delete/:id")
    async delete(@Param("id") id: string, @Req() req: RequestWithFiles, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Product not found");

            doc.isDelete = 1;
            doc.updatedBy = new ObjectId(req.user.userId);
            doc.updatedAt = new Date();
            await this.repo.save(doc);

            return response(res, StatusCodes.OK, "Product deleted successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
