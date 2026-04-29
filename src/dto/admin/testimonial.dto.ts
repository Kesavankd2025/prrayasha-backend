import { IsOptional, IsString, IsBoolean, IsNumber } from "class-validator";
import { Type } from "class-transformer";

export class CreateTestimonialDto {
    @IsString()
    @IsOptional()
    clientName?: string;

    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    message?: string;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    rating?: number;

    @IsBoolean()
    @IsOptional()
    status?: boolean;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    displayOrder?: number;
}

export class UpdateTestimonialDto {
    @IsString()
    @IsOptional()
    clientName?: string;

    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    message?: string;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    rating?: number;

    @IsBoolean()
    @IsOptional()
    status?: boolean;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    displayOrder?: number;
}
