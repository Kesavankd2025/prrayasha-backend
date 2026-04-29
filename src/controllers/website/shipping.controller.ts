import { JsonController, Post, Body, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { ShippingMethod } from "../../entity/ShippingMethod";
import { CalculateShippingDto } from "../../dto/website/shipping.dto";
import { handleErrorResponse, response } from "../../utils";

@JsonController("/shipping")
export class WebsiteShippingController {
    private repo = AppDataSource.getMongoRepository(ShippingMethod);

    @Post("/calculate")
    async calculateShipping(@Body() body: CalculateShippingDto, @Res() res: Response) {
        try {
            const { state, totalAmount } = body;

            // 1. Fetch active shipping method based on amount
            const method = await this.repo.findOneBy({
                type: "amount",
                isActive: true,
                isDelete: 0
            });

            if (!method || !method.rules || method.rules.length === 0) {
                return response(res, StatusCodes.OK, "No matching shipping rules found", {
                    shippingCharge: 0,
                    discount: 0
                });
            }

            // 2. Determine if state is TN / Pondicherry
            const tnStates = ["tamil nadu", "tamilnadu", "pondicherry", "puducherry"];
            const isTN = tnStates.includes(state.trim().toLowerCase());

            // 3. Find matching rule based on amount range
            const rule = method.rules.find((r: any) => 
                totalAmount >= r.from && totalAmount <= r.to
            );

            if (!rule) {
                // If no range matches, default to 0 or handle as needed
                return response(res, StatusCodes.OK, "No matching amount range found", {
                    shippingCharge: 0,
                    discount: 0
                });
            }

            // 4. Extract charges based on state type
            let shippingCharge = 0;
            let discount = 0;

            if (isTN) {
                shippingCharge = Number(rule.tnAmount) || 0;
                discount = Number(rule.tnDiscount) || 0;
            } else {
                shippingCharge = Number(rule.osAmount) || 0;
                discount = Number(rule.osDiscount) || 0;
            }

            return response(res, StatusCodes.OK, "Shipping charge calculated successfully", {
                shippingCharge,
                discount,
                isTamilNadu: isTN,
                appliedRule: { from: rule.from, to: rule.to }
            });

        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
