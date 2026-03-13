import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("sub-categories")
export class SubCategory {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    categoryId: ObjectId;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    slug: string;

    @Column({ nullable: true })
    description: string;

    @Column("simple-json", { nullable: true })
    image?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @Column({ nullable: true })
    status: boolean;

    @Column({ nullable: true })
    metaTitle: string;

    @Column({ nullable: true })
    metaKeywords: string;

    @Column({ nullable: true })
    metaDescription: string;

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

    @Column({ default: 0 })
    displayOrder: number;
}
