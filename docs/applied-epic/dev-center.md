## Overview

**Welcome to the Applied DevCenter Getting Started Guide!**

The Applied DevCenter offers a series of APIs that allow you to integrate different services into your applications.

The following sections guide you through the steps for executing your first API call on Applied DevCenter. Completing this process may take up to 15 minutes.

## Registration

#### Create an Account

To use Applied APIs, you need to have a registered account in the DevCenter.

To create an account:

1. Click _Login --> Create new account._
2. Complete the registration form.
3. Click _Create new account_ at the bottom of the form.
   After you submit the form, you receive an email with an activation link.
4. Click the link in the email to activate your registration.

#### Create an App

To start using an API, you must create a mock app and obtain an API key.

To create an app in the Mock Apps page:

1. At the top of the Applied DevCenter landing page, click _Mock Apps_.
2. Click _Add Mock App_.
3. Provide a name for the mock app.
4. Provide a description for the app.
5. Select the API products you want to associate with the app.
6. Click _Submit_.
7. On the _Mock Apps_ page, check the status of your apps (all apps are approved by default).
8. When your app status is _Approved_, click the name of the app. You can find the _Consumer Key_ (API key) and _Consumer Secret_ on the opening detail page.

## Promotion

To request to promote an app to production:

1. On the _Mock Apps_ page, select the mock app and click _Promote to Prod_.
2. Complete the basic details for the app in the form and send it to Applied Admin for evaluation.
   Requests may take two to five business days to process. Once the request is processed, you receive a notification to your email.
3. Visit the Projects page to test the app in production.
4. Invite your team members to the project. They must have permission to create apps.

**Note**: You require **App Promoter** permission to promote an app. Contact your system administrator or use [Contact Us](https://devcenter.myappliedproducts.com/contact) to request **App Promoter** permission.

## Environments

#### Mock Environment

Registered users have access to a mock API environment ([https://api.mock.myappliedproducts.com](https://api.mock.myappliedproducts.com/)) for testing. It is designed to provide static responses to help developers understand the structure and format of the data returned from the APIs. Requests for API credentials used for the mock environment are approved automatically. You can then use the API credentials from within the DevCenter or within your own code for testing.

#### Production Environment

Once you have completed testing in the mock environment, you can submit a request to obtain credentials for the production environment ([https://api.myappliedproducts.com](https://api.myappliedproducts.com/)). To process your request, we require basic information, such as: username (email address), organization (agency/brokerage) name, app name, and the Applied Epic database name.

### Authentication

Access tokens are mapped to your credentials and determine your authorization to call the approved APIs you have connected to your app. To call APIs in a given environment, you must obtain a token from that environment. To get an access token, you first make a `POST` call to the token endpoint (`/v1/auth/connect/token`) of the Authorization Server, passing your key and secret using HTTP Basic Authentication. Additionally, within the body of the header specify "grant_type=client_credentials" as well as "audience=api.myappliedproducts.com/epic".

The `Authorization` header can be created as follows:

```xml
'Basic ' + base64(<key> + ':' + <secret>)
```

#### Examples

**Example:** _Get an Access Token in the mock environment_

REQUEST:

```yaml
POST /v1/auth/connect/token HTTP/1.1
Host: api.mock.myappliedproducts.com
Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
audience=api.myappliedproducts.com/epic
```

RESPONSE:

```yaml
HTTP/1.1 200 OK
Content-Type: application/json
{
  "access_token": "eyJraWQiOiIyZTJiZjhiZi00NjA3LTQwMzItYWY.....",
  "expires_in": 7200,
  "token_type": "Bearer"
}
```

**Example:** _Get an Access Token in the production environment_

REQUEST:

```yaml
POST /v1/auth/connect/token HTTP/1.1
Host: api.myappliedproducts.com
Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
audience=api.myappliedproducts.com/epic
```

RESPONSE:

```yaml
HTTP/1.1 200 OK
Content-Type: application/json
{
  "access_token": "eyJraWQiOiIyZTJiZjhiZi00NjA3LTQwMzItYWY.....",
  "expires_in": 7200,
  "token_type": "Bearer"
}
```

Once you have an access token, you pass it in the `Authorization` header when making API calls:

```yaml
Authorization: Bearer eyJraWQiOiIyZTJiZjhiZi00NjA3LTQwMzItYWY.....
```

## Project Roles and Permissions

| **Roles**                         | **Permissions**                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| View Only members                 | - Can view any app                                                                                                                                                                 |
| Project Admin                     | - Can view any app - Can request Test apps - Can request Test app changes - Can request Prod apps - Can request Prod apps changes - Can manage members (Invite and Delete members) |
| App Requester (Member Developers) | - Can view any app - Can request Test apps - Can request Test app changes - Can request Prod apps - Can request Prod apps changes                                                  |

The APIs use standard HTTP response codes to indicate success or failure. Codes in the 4xx range indicate failures due to information provided by the API consumer. Codes in the 5xx range indicate errors with the APIs.

All error responses from the APIs follow the [Problem Details format](https://datatracker.ietf.org/doc/html/rfc7807). We have used the extension points provided by the RFC to add the following fields to help you with further debugging:

- **TraceId:** Provides a unique identifier generated for the instance of the error by Applied servers
- **AdditionalDetails:** Provides more detail in JSON format about the problems encountered, using the “detail” text property

Any Applied-specific errors in the payload may contain additional information.

Make sure to inspect the `Content-Type` header of each error response before parsing it to confirm that the specific value it contains is correct, rather than assuming a problem message is returned for non-2xx status codes. Errors do not always originate at the API, many infrastructure components in the request/response pipeline can cause errors. Only errors returned by Applied APIs use the RFC format described previously.
