import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("brands")
export class Brand {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    slug: string;

    @Column("simple-json", { nullable: true })
    logo?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

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
