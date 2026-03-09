import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("shipping_methods")
export class ShippingMethod {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    type: 'weight' | 'pincode' | 'amount';

    @Column("json", { nullable: true })
    rules: any[]; 

    @Column({ default: true })
    isActive: boolean;

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
