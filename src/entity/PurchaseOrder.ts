import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("purchase_orders")
export class PurchaseOrder {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    orderId: string; // PO-timestamp

    @Column()
    vendorId: ObjectId;

    @Column("simple-json")
    items: {
        productId: ObjectId;
        productName: string;
        variantCombination: any[]; // The attributes chosen (e.g., Color: Red)
        orderedQty: number;
        receivedQty: number;
        purchasePrice: number;
        total: number;
        isReceived?: boolean; // Track individual item reception
    }[];

    @Column({ default: 0 })
    totalAmount: number;

    @Column({ default: 0 })
    otherCharges: number;

    @Column({ default: 0 })
    grandTotal: number;

    @Column({ default: 0 })
    paidAmount: number;

    @Column({ default: "Pending" }) // Pending, Partially Paid, Paid
    paymentStatus: string;

    @Column({ nullable: true })
    paymentMethod: string;

    @Column({ default: "Pending" }) // Pending, Received, Cancelled
    status: string;

    @Column({ nullable: true })
    remarks: string;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    createdBy?: ObjectId;

    @Column({ nullable: true })
    updatedBy?: ObjectId;
}
