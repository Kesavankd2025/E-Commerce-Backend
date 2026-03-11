import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("vendor_payments")
export class VendorPayment {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    purchaseOrderId: ObjectId; // Ref to PurchaseOrder

    @Column()
    vendorId: ObjectId;

    @Column({ default: 0 })
    amount: number;

    @Column()
    paymentMethod: string; // Cash, GPay, Bank Transfer, etc.

    @Column({ nullable: true })
    transactionId?: string;

    @Column({ nullable: true })
    remarks?: string;

    @Column()
    paymentDate: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    createdBy?: ObjectId;
}
