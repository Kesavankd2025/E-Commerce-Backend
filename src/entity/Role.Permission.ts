// entity/Role.ts
import {
    Entity,
    ObjectIdColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from "typeorm";
import { ObjectId } from "mongodb";
import { RoleType } from "../enum/role";

@Entity("roles")
export class Role {
    @ObjectIdColumn()
    _id: ObjectId;

    @Index({ unique: true })
    @Column()
    name: string;

    @Index({ unique: true })
    @Column()
    code: string;

    @Column({ default: 1 })
    isActive: number;

    @Column({ default: 0 })
    isDelete: number;

    @Column({
        type: "enum",
        enum: RoleType,
        default: RoleType.NONE
    })
    roleType: RoleType;

    @Column({ default: false })
    mobileAdminAccess: boolean;

    @Column("json")
    permissions: {
        moduleId: ObjectId;
        actions: {
            view: boolean;
            add: boolean;
            edit: boolean;
            delete: boolean;
        };
    }[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column()
    createdBy: ObjectId;

    @Column()
    updatedBy: ObjectId;
}
