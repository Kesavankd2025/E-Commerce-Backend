import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("stockUpdateion")
export class StockLog {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    productId: ObjectId;

    @Column()
    productName: string;

    @Column({ nullable: true })
    attributeId: string; // SKU or a stringified version of combination

    @Column({ nullable: true })
    variantLabel: string; // e.g. "Color: Red, Size: XL"

    @Column("double")
    previousStock: number;

    @Column("double")
    quantity: number; // The change (e.g. +10 or -2)

    @Column("double")
    currentStock: number;

    @Column()
    type: "initial" | "order" | "purchase" | "physical" | "return" | "cancel";

    @Column({ nullable: true })
    referenceModel: string; // "Order", "PurchaseOrder", etc.

    @Column({ nullable: true })
    referenceId: ObjectId;

    @Column({ nullable: true })
    description: string;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    createdBy: ObjectId;
}
