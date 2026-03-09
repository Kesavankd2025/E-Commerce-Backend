import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn
} from "typeorm";
import { ObjectId } from "mongodb";
import { BadgeType } from "../enum/badges";
@Entity('badges')
export class Badge {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    name: string;

    @Column({
        type: "enum",
        enum: BadgeType,
        default: BadgeType.MEMBER
    })
    type: BadgeType;

    @Column("simple-json", { nullable: true })
    badgeImage?: {
        fileName?: string;
        Path?: string;
        originalName?: string;
    };

    @Column({ default: 1 })
    isActive: number;

    @Column({ default: 0 })
    isDelete: number;

    @Column()
    createdBy: ObjectId;

    @Column()
    updatedBy: ObjectId;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
