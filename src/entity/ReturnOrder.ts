import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from "typeorm";
import { ObjectId } from "mongodb";

export enum ReturnOrderStatus {
    INITIATED = "Return-Initiated",
    APPROVED = "Approved",
    PICKEDUP = "Pickedup",
    RECEIVED = "Received to Warehouse",
}

@Entity("return_orders")
export class ReturnOrder {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    originalOrderId: ObjectId;

    @Column({ nullable: true })
    userId: ObjectId;

    @Column("simple-json")
    products: {
        productId: ObjectId;
        productName: string;
        sku: string | number;
        combination?: {
            attributeId: ObjectId;
            value: string;
        }[];
        price: number;
        mrp: number;
        qty: number;
        total: number;
        image?: {
            fileName?: string;
            path?: string;
            originalName?: string;
        };
    }[];

    @Column({ default: 0 })
    totalAmount: number;

    @Column({ default: 0 })
    taxAmount: number;

    @Column({ default: 0 })
    shippingCharge: number;

    @Column({ default: 0 })
    grandTotal: number;

    @Column()
    paymentMethod: string;

    @Column({ default: "Pending" })
    paymentStatus: string;

    @Column({
        type: "enum",
        enum: ["Return-Initiated", "Approved", "Pickedup", "Received to Warehouse"],
        default: "Return-Initiated"
    })
    orderStatus: string;

    @Column("simple-json")
    address: {
        name: string;
        phone: string;
        doorNo: string;
        street: string;
        city: string;
        state: string;
        pincode: string;
    };

    @Column({ default: 1 })
    isActive: number;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    orderIdString?: string; // Original order ID string for display
}
