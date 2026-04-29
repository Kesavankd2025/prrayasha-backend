import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectId } from "mongodb";

@Entity("blogs")
export class Blog {
    @ObjectIdColumn()
    id: ObjectId;

    @Column({ nullable: true })
    title: string;

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
    publishDate: Date;

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
