import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("addresses")
export class Address {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    userId: ObjectId;

    @Column()
    name: string;

    @Column()
    phone: string;

    @Column()
    doorNo: string;

    @Column()
    street: string;

    @Column()
    city: string;

    @Column()
    state: string;

    @Column()
    pincode: string;

    @Column()
    label: string; // e.g., Home, Work

    @Column({ default: false })
    isDefault: boolean;

    @Column({ default: 1 })
    isActive: number;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
