import { IsOptional, IsNotEmpty, IsString, IsBoolean, IsNumber, IsDate } from "class-validator";
import { Type } from "class-transformer";

export class CreateBlogDto {
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    slug?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsOptional()
    image?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @IsBoolean()
    @IsOptional()
    status?: boolean;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    publishDate?: Date;

    @IsString()
    @IsOptional()
    metaTitle?: string;

    @IsString()
    @IsOptional()
    metaKeywords?: string;

    @IsString()
    @IsOptional()
    metaDescription?: string;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    displayOrder?: number;
}

export class UpdateBlogDto {
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    slug?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsOptional()
    image?: {
        fileName?: string;
        path?: string;
        originalName?: string;
    };

    @IsBoolean()
    @IsOptional()
    status?: boolean;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    publishDate?: Date;

    @IsString()
    @IsOptional()
    metaTitle?: string;

    @IsString()
    @IsOptional()
    metaKeywords?: string;

    @IsString()
    @IsOptional()
    metaDescription?: string;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    displayOrder?: number;
}
