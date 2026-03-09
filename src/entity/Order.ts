import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { ObjectId } from "mongodb";
export enum OrderStatus {
  PENDING = "Pending",
  PROCESSING = "Processing",
  DELIVERED = "Delivered",
  CANCELLED = "Cancelled",
}

export enum PaymentStatus {
  PENDING = "Pending",
  PAID = "Paid",
  FAILED = "Failed",
}

@Entity("orders")
export class Order {
  @ObjectIdColumn()
  id: ObjectId;

  // LOCATION
  @Column()
  zoneId: ObjectId;

  @Column()
  regionId: ObjectId;

  @Column()
  chapterId: ObjectId;

  // MEMBER
  @Column()
  memberId: ObjectId;

  // PRODUCT (single product for now)
  @Column("simple-json", { nullable: true })
  products: {
    productId: ObjectId;
    amount: number;
    qty: number;
    price: number;
    total: number;
  }[];

  @Column({ default: 0 })
  grantTotal: number;
  // SYSTEM
  @Column({ default: 1 })
  isActive: number;

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

  // ORDER STATUS
  @Column({
    type: "enum",
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  // PAYMENT STATUS
  @Column({
    type: "enum",
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  @Column({
    type: "enum",
    enum: ["Offline", "Online"],
    default: "Offline",
  })
  paymentMode: "Offline" | "Online";

  @Column({ nullable: true })
  paymentProof: string;

  @Column()
  orderId?: string;
}
