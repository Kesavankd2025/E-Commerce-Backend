import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("payment_details")
export class PaymentDetail {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    orderId: ObjectId;

    @Column("simple-json")
    payments: {
        method: string;
        amount: number;
    }[];

    @Column()
    totalAmount: number;

    @Column()
    receivedAmount: number;

    @Column()
    balanceAmount: number;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
