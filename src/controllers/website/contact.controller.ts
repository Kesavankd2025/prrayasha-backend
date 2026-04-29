import { Body, JsonController, Post, Res } from "routing-controllers";
import { Response } from "express";
import { AppDataSource } from "../../data-source";
import { Contact } from "../../entity/Contact";
import { handleErrorResponse, response } from "../../utils";
import { StatusCodes } from "http-status-codes";

@JsonController("/contact")
export class WebsiteContactController {
    private repo = AppDataSource.getMongoRepository(Contact);

    @Post("/submit")
    async submit(
        @Body() body: any,
        @Res() res: Response
    ) {
        try {
            const { fullName, email, mobileNumber, message } = body;

            if (!fullName || !email || !mobileNumber || !message) {
                return response(res, StatusCodes.BAD_REQUEST, "All fields are required");
            }

            const newContact = new Contact();
            newContact.fullName = fullName;
            newContact.email = email;
            newContact.mobileNumber = mobileNumber;
            newContact.message = message;
            newContact.isDelete = 0;

            await this.repo.save(newContact);

            return response(res, StatusCodes.OK, "Contact inquiry submitted successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
