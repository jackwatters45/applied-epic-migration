[Download Specification](https://devcenter.myappliedproducts.com/system/files/2025-08/applied-epic-attachment-v2.yml)

Manage attachment files and details

### default

Get list of attachments. This method requires version July 2023 of Epic or later to be utilized.

#### Request

##### Parameters

attachedOn_before

string ($date-time)

(query)

attachedOn_after

string ($date-time)

(query)

clientAccessible

boolean

(query)

description

string

(query)

description_contains

string

(query)

editedOn_before

string ($date-time)

(query)

editedOn_after

string ($date-time)

(query)

folder

string ($uuid)

(query)

inactiveOn_before

string ($date-time)

(query)

inactiveOn_after

string ($date-time)

(query)

systemGenerated

boolean

(query)

organization

string ($uuid)

(query)

has_client_accessed

boolean

(query)

include_subfolders

boolean

(query)

accessible_by_employee_code

string

(query)

accountType

string

(query)

embed

string

(query)

limit

integer

(query)

offset

integer

(query)

active_status

string

(query)

account

string ($uuid)

(query)

activity

string ($uuid)

(query)

policy

string ($uuid)

(query)

carrierSubmission

string

(query)

claim

string ($uuid)

(query)

line

string ($uuid)

(query)

marketingSubmission

string

(query)

opportunity

string ($uuid)

(query)

service

string ($uuid)

(query)

certificate

string ($uuid)

(query)

evidence

string ($uuid)

(query)

governmentReconciliation

string ($uuid)

(query)

cancellation

string ($uuid)

(query)

reconciliation

string ($uuid)

(query)

quote

string ($uuid)

(query)

disbursement

string ($uuid)

(query)

fileStatus

string

(query)

Accept-Language

string

(header)

#### Responses

OK

Schema

total integer

\_links

\_embedded

attachments

id

description

active

summary

folder

accessLevel

account

organizations

attachedOn

editedOn

receivedOn

clientAccessedOn

attachedTos

clientAccessible

systemGenerated

file

id

status

inactiveOn

\_links

\_embedded

Example

```json
{
  "total": 10,
  "_links": {
    "self": {
      "href": "https://api.mock.myappliedproducts.com/epic/attachment/v2/attachments?offset=2&limit=4"
    },
    "prev": {
      "href": "https://api.mock.myappliedproducts.com/epic/attachment/v2/attachments?offset=1&limit=4"
    },
    "next": {
      "href": "https://api.mock.myappliedproducts.com/epic/attachment/v2/attachments?offset=3&limit=4"
    },
    "first": {
      "href": "https://api.mock.myappliedproducts.com/epic/attachment/v2/attachments?limit=2"
    },
    "last": {
      "href": "https://api.mock.myappliedproducts.com/epic/attachment/v2/attachments?offset=3&limit=4"
    }
  },
  "_embedded": {
    "attachments": [
      {
        "id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
        "description": "Policy Attachment",
        "active": true,
        "summary": "Policy Attachment",
        "folder": "ca579eb8-24ac-44d0-a8b9-a42c500083f5",
        "account": "10f640b2-7f1a-4cf2-971d-6794c5078633",
        "accessLevel": "1e663fae-4bf6-4fd7-bd34-f7f0231d99b4",
        "organizations": [
          "3204522f-b929-46ed-8255-9fd0e8064113",
          "f56d6c5c-923c-46e3-86e1-2d56f0b11aeb"
        ],
        "attachedOn": "2019-08-24T14:15:22Z",
        "editedOn": "2019-08-24T14:15:22Z",
        "receivedOn": "2019-08-24T14:15:22Z",
        "clientAccessedOn": "2019-08-24T14:15:22Z",
        "attachedTos": [
          {
            "id": "10f640b2-7f1a-4cf2-971d-6794c5078633",
            "type": "ACCOUNT",
            "description": "INS002 - Insured client",
            "primary": true,
            "_links": {
              "self": {
                "href": "https://api.mock.myappliedproducts.com/epic/account/v1/accounts/f56d6c5c-923c-46e3-86e1-2d56f0b11aeb"
              }
            }
          },
          {
            "id": "eb1521b5-0d8d-4134-a57a-8ec9c037069a",
            "type": "POLICY",
            "description": "INS002 - Insured client - Policy 1234",
            "primary": true,
            "_links": {
              "self": {
                "href": "https://api.mock.myappliedproducts.com/epic/policy/v1/policies/eb1521b5-0d8d-4134-a57a-8ec9c037069a"
              }
            }
          }
        ],
        "clientAccessible": true,
        "systemGenerated": true,
        "inactiveOn": "",
        "file": {
          "id": "3a969174-c427-437b-a316-330ddfb4ab91",
          "status": "OK"
        },
        "_links": {
          "self": {
            "href": "https://api.mock.myappliedproducts.com/epic/attachment/v2/attachments/497f6eca-6276-4993-bfeb-53cbbbba6f08"
          },
          "account": {
            "href": "https://api.mock.myappliedproducts.com/epic/account/v1/accounts/f56d6c5c-923c-46e3-86e1-2d56f0b11aeb"
          },
          "folder": {
            "href": "https://api.mock.myappliedproducts.com/epic/attachment-folder/v1/attachment-folders/ca579eb8-24ac-44d0-a8b9-a42c500083f5"
          },
          "accessLevel": {
            "href": "https://api.mock.myappliedproducts.com/epic/attachment-access-level/v1/attachment-access-levels/1e663fae-4bf6-4fd7-bd34-f7f0231d99b4"
          },
          "organizations": {
            "href": "https://api.mock.myappliedproducts.com/epic/attachment/v2/attachments/497f6eca-6276-4993-bfeb-53cbbbba6f08/organizations"
          }
        }
      },
      {
        "id": "d3552b26-38c8-4f33-86fe-7d393f6f41f2",
        "description": "Car Image",
        "active": false,
        "summary": "Car Image",
        "account": "2311df20-b788-46c4-9d90-3bfe8746f1e0",
        "organizations": ["3204522f-b929-46ed-8255-9fd0e8064113"],
        "attachedOn": "2019-08-24T14:15:22Z",
        "editedOn": "2019-08-24T14:15:22Z",
        "receivedOn": "2019-08-24T14:15:22Z",
        "clientAccessedOn": "2019-08-24T14:15:22Z",
        "attachedTos": [
          {
            "id": "2311df20-b788-46c4-9d90-3bfe8746f1e0",
            "type": "ACCOUNT",
            "description": "INS002 - Insured client",
            "primary": true,
            "_links": {
              "self": {
                "href": "https://api.mock.myappliedproducts.com/epic/account/v1/accounts/2311df20-b788-46c4-9d90-3bfe8746f1e0"
              }
            }
          }
        ],
        "clientAccessible": true,
        "systemGenerated": true,
        "inactiveOn": "2019-08-24T14:15:22Z",
        "file": {
          "id": "42721567-c1a0-4915-a3ee-6731e11b457c",
          "status": "QUARANTINED"
        },
        "_links": {
          "self": {
            "href": "https://api.mock.myappliedproducts.com/epic/attachment/v2/attachments/d3552b26-38c8-4f33-86fe-7d393f6f41f2"
          },
          "account": {
            "href": "https://api.mock.myappliedproducts.com/epic/account/v1/accounts/2311df20-b788-46c4-9d90-3bfe8746f1e0"
          },
          "organizations": {
            "href": "https://api.mock.myappliedproducts.com/epic/attachment/v2/attachments/d3552b26-38c8-4f33-86fe-7d393f6f41f2/organizations"
          }
        }
      }
    ]
  }
}
```
