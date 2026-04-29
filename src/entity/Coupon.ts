import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("coupons")
export class Coupon {
    @ObjectIdColumn()
    id: ObjectId;

    @Column()
    @Index({ unique: true })
    code: string;

    @Column()
    title: string;

    @Column({ nullable: true })
    description: string;

    @Column({ default: true })
    status: boolean;

    @Column()
    startDate: Date;

    @Column()
    endDate: Date;

    @Column()
    discountType: "percentage" | "fixed"; // 'percentage' or 'fixed'

    @Column("double")
    discountValue: number;

    @Column("double", { nullable: true })
    maxDiscountAmount: number;

    @Column()
    offerType: "all" | "category" | "product"; // 'all', 'category', 'product'

    @Column({ nullable: true })
    categoryIds: ObjectId[];

    @Column({ nullable: true })
    productIds: ObjectId[];

    @Column("double", { nullable: true })
    minOrderAmount: number;

    @Column("int")
    totalLimit: number;

    @Column("int")
    userLimit: number;

    @Column()
    applicableUserType: "all" | "new" | "specific"; // 'all', 'new', 'specific'

    @Column({ nullable: true })
    specificUserIds: ObjectId[];

    @Column({ nullable: true })
    excludedProductIds: ObjectId[];

    @Column({ nullable: true })
    excludedCategoryIds: ObjectId[];

    @Column({ default: false })
    allowCombining: boolean;

    @Column({ default: true })
    isPublic: boolean; // Public or Private

    @Column({ default: false })
    autoApply: boolean;

    @Column({ default: 0 })
    priority: number;

    @Column({ default: 0 })
    usedCount: number;

    @Column({ default: 0 })
    isDelete: number;

    @Column({ nullable: true })
    createdBy: ObjectId;

    @Column({ nullable: true })
    updatedBy: ObjectId;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
