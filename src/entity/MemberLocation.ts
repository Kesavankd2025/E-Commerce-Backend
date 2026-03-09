import { ObjectId } from "mongodb";
import { Column, CreateDateColumn, Entity, ObjectIdColumn, UpdateDateColumn } from "typeorm";

@Entity("member_locations")
export class MemberLocation {

  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  memberId: ObjectId;

  @Column()
  name: string;

  @Column()
  location: {
    name: string;
    latitude: number;
    longitude: number;
  };

  @Column({ default: 1 })
  isActive: number;

  @Column({ default: 0 })
  isDelete: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  createdBy: ObjectId;

  @Column({ nullable: true })
  updatedBy?: ObjectId;
}
