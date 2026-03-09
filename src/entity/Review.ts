import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("reviews")
export class Review {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    userId: ObjectId;

    @Column()
    productId: ObjectId;

    @Column({ nullable: true })
    orderId: ObjectId;

    @Column("simple-json", { nullable: true })
    combination?: {
        attributeId: ObjectId;
        value: string;
    }[];

    @Column()
    rating: number; // 1-5

    @Column()
    comment: string;

    @Column({ default: 0 }) // 0: Inactive/Pending, 1: Active
    status: number;

    @Column({ default: 0 })
    isDelete: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
