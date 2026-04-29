import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("wishlists")
export class Wishlist {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    userId: ObjectId;

    @Column({ nullable: true })
    guestId: string;

    @Column()
    productId: ObjectId;

    @Column("simple-json", { nullable: true })
    combination: {
        attributeId: ObjectId;
        valueId: ObjectId;
        value: string;
    }[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
