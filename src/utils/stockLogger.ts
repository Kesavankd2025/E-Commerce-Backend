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
    type: "initial" | "order" | "purchase" | "physical" | "return" | "cancel";
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
            const variantIdx = product.attributes.findIndex((attr: any) =>
                attr.sku === item.sku || JSON.stringify(attr.combination) === JSON.stringify(item.combination)
            );

            if (variantIdx !== -1) {
                const prevStock = Number(product.attributes[variantIdx].stock) || 0;
                const qtyToDeduct = Number(item.qty || item.quantity);
                product.attributes[variantIdx].stock = prevStock - qtyToDeduct;

                await logStockChange({
                    productId: product.id,
                    productName: product.name,
                    attributeId: product.attributes[variantIdx].sku,
                    variantLabel: "", // Optionally construct
                    previousStock: prevStock,
                    quantity: -qtyToDeduct,
                    currentStock: product.attributes[variantIdx].stock,
                    type: type,
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
                const variantIdx = product.attributes.findIndex((attr: any) =>
                    attr.sku === item.sku || (attr.combination && JSON.stringify(attr.combination) === JSON.stringify(item.combination))
                );

                if (variantIdx !== -1) {
                    const prevStock = Number(product.attributes[variantIdx].stock) || 0;
                    const qtyToDeduct = Number(item.qty || item.quantity);
                    product.attributes[variantIdx].stock = prevStock - qtyToDeduct;

                    await logStockChange({
                        productId: product.id,
                        productName: product.name,
                        attributeId: product.attributes[variantIdx].sku,
                        variantLabel: "",
                        previousStock: prevStock,
                        quantity: -qtyToDeduct,
                        currentStock: product.attributes[variantIdx].stock,
                        type: type,
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
                const variantIdx = product.attributes.findIndex((attr: any) =>
                    attr.sku === item.sku || (attr.combination && JSON.stringify(attr.combination) === JSON.stringify(item.combination))
                );

                if (variantIdx !== -1) {
                    const prevStock = Number(product.attributes[variantIdx].stock) || 0;
                    const qtyToRestore = Number(item.qty || item.quantity);
                    product.attributes[variantIdx].stock = prevStock + qtyToRestore;

                    await logStockChange({
                        productId: product.id,
                        productName: product.name,
                        attributeId: product.attributes[variantIdx].sku,
                        variantLabel: "",
                        previousStock: prevStock,
                        quantity: qtyToRestore,
                        currentStock: product.attributes[variantIdx].stock,
                        type: type,
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
