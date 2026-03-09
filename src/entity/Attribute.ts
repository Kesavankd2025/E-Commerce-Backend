import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("attributes")
export class Attribute {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    value: any;

    @Column({ nullable: true })
    displayName: string;

    @Column({ nullable: true })
    description: string;

    @Column({ nullable: true })
    status: boolean;

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
