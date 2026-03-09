import { AppDataSource } from "../data-source";
import { Member } from "../entity/Member";
import { Order } from "../entity/Order";
import { Training } from "../entity/Training";

export async function generateMembershipId(): Promise<string> {

    try {
        const lastWorkOrder = await AppDataSource.getMongoRepository(Member).findOne({
            where: { isActive: 1 },
            order: { createdAt: "DESC" }
        });

        const lastId = lastWorkOrder?.membershipId?.replace('MEMB', '') || '001';
        const numeric = parseInt(lastId) || 0;
        const newId = `MEMB${(numeric + 1).toString().padStart(3, '0')}`;
        return newId;
    } catch (err) {
        throw err;
    }

}
export async function generateOrderId(): Promise<string> {

    try {
        const lastWorkOrder = await AppDataSource.getMongoRepository(Order).findOne({
            where: { isActive: 1 },
            order: { createdAt: "DESC" }
        });

        const lastId = lastWorkOrder?.orderId?.replace('ORD', '') || '001';
        const numeric = parseInt(lastId) || 0;
        const newId = `ORD${(numeric + 1).toString().padStart(3, '0')}`;
        return newId;
    } catch (err) {
        throw err;
    }

}
export async function generateTrainingId(): Promise<string> {

    try {
        const lastWorkOrder = await AppDataSource.getMongoRepository(Training).findOne({
            where: { isActive: 1 },
            order: { createdAt: "DESC" }
        });

        const lastId = lastWorkOrder?.trainingId?.replace('TRNG', '') || '001';
        const numeric = parseInt(lastId) || 0;
        const newId = `TRNG${(numeric + 1).toString().padStart(3, '0')}`;
        return newId;
    } catch (err) {
        throw err;
    }

}