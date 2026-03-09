import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from "typeorm";
import { ObjectId } from "mongodb";

@Entity()
export class Event {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    title: string;

    @Column()
    details: string;

    @Column()
    venue: string;

    @Column()
    date: Date;

    @Column("simple-json", { nullable: true })
    image: {
        fileName: string;
        path: string;
        originalName: string;
    };

    @Column({ default: 0 })
    isDelete: number;

    @Column({ default: 1 })
    isActive: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column()
    createdBy: ObjectId;

    @Column()
    updatedBy: ObjectId;
}
