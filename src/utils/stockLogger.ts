import { AppDataSource } from "../data-source";
import { StockLog } from "../entity/StockLog";
import { Product } from "../entity/Product";
import { ObjectId } from "mongodb";

export const logStockChange = async (data: {
    productId: ObjectId;
    productName: string;
    attributeId?: string;
    variantLabel?: string;
    previousStock: number;
    quantity: number;
    currentStock: number;
    type: "initial" | "order" | "purchase" | "physical" | "return" | "cancel" | "stock_update";
    attributes?: { attributeId: ObjectId, valueId: ObjectId }[];
    referenceModel?: string;
    referenceId?: ObjectId;
    description?: string;
    userId?: ObjectId;
}) => {
    try {
        const repo = AppDataSource.getMongoRepository(StockLog);
        const log = new StockLog();
        log.productId = data.productId;
        log.productName = data.productName;
        log.attributeId = data.attributeId;
        log.variantLabel = data.variantLabel;
        log.previousStock = data.previousStock;
        log.quantity = data.quantity;
        log.currentStock = data.currentStock;
        log.type = data.type;
        log.attributes = data.attributes;
        log.referenceModel = data.referenceModel;
        log.referenceId = data.referenceId;
        log.description = data.description;
        log.createdBy = data.userId;

        await repo.save(log);
    } catch (error) {
        console.error("Error logging stock change:", error);
    }
};

export const deductStock = async (productId: ObjectId, items: any[], type: "order", referenceModel: string, referenceId: ObjectId, userId?: ObjectId) => {
    try {
        const productRepo = AppDataSource.getMongoRepository(Product);
        const product = await productRepo.findOneBy({ _id: productId });
        if (!product || !product.attributes) return;

        for (const item of items) {
            const variantIdx = product.attributes.findIndex((attr: any) => {
                const skuMatch = attr.sku && item.sku && String(attr.sku) === String(item.sku);

                let combinationMatch = false;
                if (attr.combination && item.combination) {
                    try {
                        const normalize = (comb: any[]) => comb.map(c => {
                            const sortedObj: any = {};
                            Object.keys(c).sort().forEach(key => {
                                sortedObj[key] = String(c[key]);
                            });
                            return sortedObj;
                        }).sort((a, b) => a.attributeId.localeCompare(b.attributeId));

                        combinationMatch = JSON.stringify(normalize(attr.combination)) === JSON.stringify(normalize(item.combination));
                    } catch (e) {
                        combinationMatch = JSON.stringify(attr.combination) === JSON.stringify(item.combination);
                    }
                }

                return skuMatch || combinationMatch;
            });

            if (variantIdx !== -1) {
                const prevStock = Number(product.attributes[variantIdx].stock) || 0;
                const qtyToDeduct = Number(item.qty || item.quantity);
                product.attributes[variantIdx].stock = prevStock - qtyToDeduct;

                const variantLabel = (product.attributes[variantIdx].combination || [])
                    .map((c: any) => c.value)
                    .filter(Boolean)
                    .join(", ");

                const stockLogAttributes = (product.attributes[variantIdx].combination || []).map((c: any) => ({
                    attributeId: new ObjectId(c.attributeId),
                    valueId: new ObjectId(c.valueId)
                }));

                await logStockChange({
                    productId: product.id,
                    productName: product.name,
                    attributeId: product.attributes[variantIdx].sku,
                    variantLabel: variantLabel,
                    previousStock: prevStock,
                    quantity: -qtyToDeduct,
                    currentStock: product.attributes[variantIdx].stock,
                    type: type,
                    attributes: stockLogAttributes,
                    referenceModel: referenceModel,
                    referenceId: referenceId,
                    userId: userId
                });
            }
        }
        await productRepo.save(product);
    } catch (error) {
        console.error("Error deducting stock:", error);
    }
};

export const deductStockForOrder = async (orderProducts: any[], type: "order", referenceModel: string, referenceId: ObjectId, userId?: ObjectId) => {
    try {
        const productRepo = AppDataSource.getMongoRepository(Product);

        // Group items by productId for efficiency
        const grouped: { [key: string]: any[] } = {};
        orderProducts.forEach(p => {
            const id = p.productId.toString();
            if (!grouped[id]) grouped[id] = [];
            grouped[id].push(p);
        });

        for (const productIdStr in grouped) {
            const productId = new ObjectId(productIdStr);
            const items = grouped[productIdStr];

            const product = await productRepo.findOneBy({ _id: productId });
            if (!product || !product.attributes) continue;

            for (const item of items) {
                const variantIdx = product.attributes.findIndex((attr: any) => {
                    const skuMatch = attr.sku && item.sku && String(attr.sku) === String(item.sku);

                    let combinationMatch = false;
                    if (attr.combination && item.combination) {
                        try {
                            const normalize = (comb: any[]) => comb.map(c => {
                                const sortedObj: any = {};
                                Object.keys(c).sort().forEach(key => {
                                    sortedObj[key] = String(c[key]);
                                });
                                return sortedObj;
                            }).sort((a, b) => String(a.attributeId).localeCompare(String(b.attributeId)));

                            combinationMatch = JSON.stringify(normalize(attr.combination)) === JSON.stringify(normalize(item.combination));
                        } catch (e) {
                            combinationMatch = JSON.stringify(attr.combination) === JSON.stringify(item.combination);
                        }
                    }

                    return skuMatch || combinationMatch;
                });

                if (variantIdx !== -1) {
                    const prevStock = Number(product.attributes[variantIdx].stock) || 0;
                    const qtyToDeduct = Number(item.qty || item.quantity);
                    product.attributes[variantIdx].stock = prevStock - qtyToDeduct;

                    const variantLabel = (product.attributes[variantIdx].combination || [])
                        .map((c: any) => c.value)
                        .filter(Boolean)
                        .join(", ");

                    const stockLogAttributes = (product.attributes[variantIdx].combination || []).map((c: any) => ({
                        attributeId: new ObjectId(c.attributeId),
                        valueId: new ObjectId(c.valueId)
                    }));

                    await logStockChange({
                        productId: product.id,
                        productName: product.name,
                        attributeId: product.attributes[variantIdx].sku,
                        variantLabel: variantLabel,
                        previousStock: prevStock,
                        quantity: -qtyToDeduct,
                        currentStock: product.attributes[variantIdx].stock,
                        type: type,
                        attributes: stockLogAttributes,
                        referenceModel: referenceModel,
                        referenceId: referenceId,
                        userId: userId
                    });
                }
            }
            await productRepo.save(product);
        }
    } catch (error) {
        console.error("Error in deductStockForOrder:", error);
    }
};

export const restoreStockForOrder = async (orderProducts: any[], type: "cancel" | "return", referenceModel: string, referenceId: ObjectId, userId?: ObjectId) => {
    try {
        const productRepo = AppDataSource.getMongoRepository(Product);

        const grouped: { [key: string]: any[] } = {};
        orderProducts.forEach(p => {
            const id = p.productId.toString();
            if (!grouped[id]) grouped[id] = [];
            grouped[id].push(p);
        });

        for (const productIdStr in grouped) {
            const productId = new ObjectId(productIdStr);
            const items = grouped[productIdStr];

            const product = await productRepo.findOneBy({ _id: productId });
            if (!product || !product.attributes) continue;

            for (const item of items) {
                const variantIdx = product.attributes.findIndex((attr: any) => {
                    const skuMatch = attr.sku && item.sku && String(attr.sku) === String(item.sku);

                    let combinationMatch = false;
                    if (attr.combination && item.combination) {
                        try {
                            const normalize = (comb: any[]) => comb.map(c => {
                                const sortedObj: any = {};
                                Object.keys(c).sort().forEach(key => {
                                    sortedObj[key] = String(c[key]);
                                });
                                return sortedObj;
                            }).sort((a, b) => String(a.attributeId).localeCompare(String(b.attributeId)));

                            combinationMatch = JSON.stringify(normalize(attr.combination)) === JSON.stringify(normalize(item.combination));
                        } catch (e) {
                            combinationMatch = JSON.stringify(attr.combination) === JSON.stringify(item.combination);
                        }
                    }

                    return skuMatch || combinationMatch;
                });

                if (variantIdx !== -1) {
                    const prevStock = Number(product.attributes[variantIdx].stock) || 0;
                    const qtyToRestore = Number(item.qty || item.quantity);
                    product.attributes[variantIdx].stock = prevStock + qtyToRestore;

                    const variantLabel = (product.attributes[variantIdx].combination || [])
                        .map((c: any) => c.value)
                        .filter(Boolean)
                        .join(", ");

                    const stockLogAttributes = (product.attributes[variantIdx].combination || []).map((c: any) => ({
                        attributeId: new ObjectId(c.attributeId),
                        valueId: new ObjectId(c.valueId)
                    }));

                    await logStockChange({
                        productId: product.id,
                        productName: product.name,
                        attributeId: product.attributes[variantIdx].sku,
                        variantLabel: variantLabel,
                        previousStock: prevStock,
                        quantity: qtyToRestore,
                        currentStock: product.attributes[variantIdx].stock,
                        type: type,
                        attributes: stockLogAttributes,
                        referenceModel: referenceModel,
                        referenceId: referenceId,
                        userId: userId
                    });
                }
            }
            await productRepo.save(product);
        }
    } catch (error) {
        console.error("Error in restoreStockForOrder:", error);
    }
};
