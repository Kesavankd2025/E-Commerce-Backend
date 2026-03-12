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
  PACKED = "Packed",
  SHIPPED = "Shipped",
  DELIVERED = "Delivered",
  RETURN = "Return",
}

export enum PaymentStatus {
  PENDING = "Pending",
  PAID = "Paid",
  FAILED = "Failed",
  PARTIALLY_PAID = "Partially Paid",
}

@Entity("orders")
export class Order {
  @ObjectIdColumn()
  id: ObjectId;

  @Column({ nullable: true })
  userId: ObjectId;

  @Column("simple-json")
  products: {
    productId: ObjectId;
    productName: string;
    sku: string | number;
    combination?: {
      attributeId: ObjectId;
      value: string;
    }[];
    price: number;
    mrp: number;
    qty: number;
    total: number;
    image?: {
      fileName?: string;
      path?: string;
      originalName?: string;
    };
  }[];

  @Column({ default: 0 })
  totalAmount: number;

  @Column({ default: 0 })
  taxAmount: number;

  @Column({ default: 0 })
  shippingCharge: number;

  @Column({ default: 0 })
  grandTotal: number;

  @Column({ default: 0 })
  overallDiscount: number;

  @Column()
  paymentMethod: string;

  @Column({
    type: "enum",
    enum: ["Pending", "Paid", "Failed", "Partially Paid"],
    default: "Pending"
  })
  paymentStatus: string;

  @Column({
    type: "enum",
    enum: ["Pending", "Packed", "Shipped", "Delivered", "Return"],
    default: "Pending"
  })
  orderStatus: string;

  @Column({ nullable: true })
  shippingMethodId: ObjectId;

  @Column("simple-json")
  address: {
    name: string;
    phone: string;
    doorNo: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
  };

  // Keep these for potential backward compatibility or internal use if needed, but make nullable
  @Column({ nullable: true })
  zoneId?: ObjectId;

  @Column({ nullable: true })
  regionId?: ObjectId;

  @Column({ nullable: true })
  chapterId?: ObjectId;

  @Column({ nullable: true })
  memberId?: ObjectId;

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

  @Column({ nullable: true })
  orderId?: string;

  @Column({ nullable: true })
  cancelReason?: string;

  @Column({ nullable: true })
  cancelDate?: Date;

  @Column({ default: "Website" })
  orderFrom: string; // "Website" or "POS"
}
