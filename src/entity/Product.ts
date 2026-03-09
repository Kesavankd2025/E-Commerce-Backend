import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("products")
export class Product {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    slug: string;

    @Column({ nullable: true })
    categoryId: ObjectId;

    @Column({ nullable: true })
    subCategoryId: ObjectId;

    @Column({ nullable: true })
    brandId: ObjectId;

    @Column({ nullable: true })
    unitId: ObjectId;

    @Column({ nullable: true })
    taxId: ObjectId;

    @Column({ nullable: true })
    hsnCode: string;

    @Column("double", { nullable: true })
    weight: number;

    @Column({ nullable: true })
    shortDescription: string;

    @Column({ nullable: true })
    fullDescription: string;

    @Column({ nullable: true })
    refundable: boolean;

    @Column({ nullable: true })
    status: boolean;

    @Column("double", { nullable: true })
    lowStockAlert: number;

    @Column({ nullable: true })
    metaTitle: string;

    @Column({ nullable: true })
    metaKeywords: string;

    @Column({ nullable: true })
    metaDescription: string;

    @Column("simple-json", { nullable: true })
    attributes: any[];

    @Column("simple-json", { nullable: true })
    specifications: any[];

    @Column("double", { nullable: true })
    price: number;

    @Column("simple-json", { nullable: true })
    productImage: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

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
