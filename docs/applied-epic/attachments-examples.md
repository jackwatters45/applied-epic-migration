## Get Attachment and Download File

The following C# function demonstrates retrieval of an attachment record, then using the accompanying signed URL to download the file and save it to a supplied directory.

```cs
private static readonly HttpClient client = new HttpClient();

  public async static Task GetDataAndFile(string attachmentId, string outputPath)
  {
      //Replace "token" with your actual token
      client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "token");

      //Get the url for the file you want to download
      HttpResponseMessage response = await client.GetAsync("https://api.test.myappliedproducts.com/epic/attachment/v2/attachments/" + attachmentId);
      response.EnsureSuccessStatusCode();
      string responseBody = await response.Content.ReadAsStringAsync();
      var jsonObject = JObject.Parse(responseBody);
      var url = jsonObject["file"]["url"].ToString();
      var fileName = jsonObject["description"].ToString() + jsonObject["file"]["extension"].ToString();

      //Download the file using the url
      HttpResponseMessage fileResponse = await client.GetAsync(url);
      fileResponse.EnsureSuccessStatusCode();
      byte[] fileContents = await fileResponse.Content.ReadAsByteArrayAsync();
      await File.WriteAllBytesAsync(outputPath + "//" + fileName, fileContents);
  }
}
```

## Insert Attachment and Upload File

The following C# function demonstrates inserting a new attachment record to a policy, followed by uploading the actual file into the system using the signed URL in the response.

```cs
private static readonly HttpClient client = new HttpClient();

public async static Task InsertDataAndFile(string filePath)
{
  //Make sure the file you want to upload exists before inserting the metadata
  if (!File.Exists(filePath))
  {
    throw new FileNotFoundException();
  }

  //Replace "token" with your actual token
  client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "token");

  var data = @"{""description"": ""policy documentation"",
                    ""active"": true,
                    ""folder"": ""c68ce1c0-550c-473d-a33a-a6d67338b770"",
                    ""receivedOn"": ""2025-04-20T14:15:22Z"",
                    ""clientAccessedOn"": ""2019-08-24T14:15:22Z"",
                    ""clientAccessible"": true,
                    ""comments"": ""string"",
                    ""clientAccessExpirationOn"": ""2025-12-31T00:00:00Z"",
                    ""doNotPurgeExpirationOn"": ""2026-12-31T00:00:00Z"",
                    ""doNotPurge"": true,
                    ""importantPolicyDocument"": true,
                    ""attachTo"": {
                      ""id"": ""807748c3-7088-4da2-b8d0-13c0cb61ef91"",
                      ""type"": ""POLICY""
                    },
                    ""uploadFileName"": ""SubmitApplication.pdf""}";

  //Build the content to insert
  HttpContent content = new StringContent(data, System.Text.Encoding.UTF8, "application/json");

  //insert the metadata for the file you want to upload
  HttpResponseMessage response = await client.PostAsync("https://api.test.myappliedproducts.com/epic/attachment/v2/attachments", content);
  response.EnsureSuccessStatusCode();
  string responseBody = await response.Content.ReadAsStringAsync();
  var jsonObject = JObject.Parse(responseBody);
  var url = jsonObject["uploadUrl"].ToString();

  //Upload the file
  byte[] fileBytes = await File.ReadAllBytesAsync(filePath);
  using (var fileContent = new ByteArrayContent(fileBytes))
  {
    fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
    response = await client.PutAsync(url, fileContent);
    response.EnsureSuccessStatusCode();
    string result = await response.Content.ReadAsStringAsync();
    Console.WriteLine(result);
  }
}
```
