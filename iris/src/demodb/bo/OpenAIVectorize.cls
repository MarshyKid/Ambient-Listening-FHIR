Include Ensemble

Class demodb.bo.OpenAIVectorize Extends Ens.BusinessOperation
{

Parameter INVOCATION = "Queue";

XData MessageMap
{
<MapItems>
            <MapItem MessageType="demodb.msg.vectorizeRequest">
                <Method>VectorizeResource</Method>
            </MapItem>
        </MapItems>
}

/// handle msg sent by bpl
Method VectorizeResource(pRequest As demodb.msg.vectorizeRequest, Output pResponse As Ens.Response) As %Status
{
    Set tSC = $$$OK
    Set pResponse = ##class(Ens.Response).%New()

    Try {
        // Your vectorisation logic here.

        Set tStream = ##class(HS.SDA3.QuickStream).%OpenId(
            pRequest.QuickStreamId
        )

        If '$IsObject(tStream) {
            Set tSC = $$$ERROR($$$GeneralError,"Unable to open FHIR QuickStream: "_pRequest.QuickStreamId)
            $$$ThrowOnError(tSC)
        }

        Do tStream.Rewind()

        Set tFHIR = ##class(%DynamicObject).%FromJSON(tStream)

        If '$IsObject(tFHIR) {
            Set tSC = $$$ERROR($$$GeneralError,"FHIR body was not valid JSON")
            $$$ThrowOnError(tSC)
        }

        Set tResourceType = tFHIR.%Get("resourceType", "")

        If tResourceType = "" {
            Set tSC = $$$ERROR($$$GeneralError,"FHIR resourceType was missing")
            $$$ThrowOnError(tSC)
        }

        Set tResourceId = pRequest.ResourceId

        If tResourceId = "" {
            Set tResourceId = tFHIR.%Get("id", "")
        }

        Set tPatientId = ..GetPatientReference(tFHIR)

        Set tSearchText = ..FHIRToSearchText(
            tFHIR,
            tPatientId,
            tResourceType,
            tResourceId
        )

        Set tSC = ..StoreResource(
            tPatientId,
            tResourceType,
            tResourceId,
            pRequest.VersionId,
            tSearchText
        )

        $$$ThrowOnError(tSC)

    } Catch tException {
        Set tSC = tException.AsStatus()

        $$$LOGERROR("Vectorisation failed: "_$SYSTEM.Status.GetErrorText(tSC)_" | Exception: "_tException.DisplayString())
    }

    Quit tSC
}

/// Extracts the patient reference from common patient-scoped resources.
Method GetPatientReference(pFHIR As %DynamicObject) As %String
{
    Set tResourceType =
        pFHIR.%Get("resourceType", "")

    /*
     * Patient resources refer to themselves.
     */
    If tResourceType = "Patient" {
        Set tId = pFHIR.%Get("id", "")

        If tId '= "" {
            Quit "Patient/"_tId
        }

        Quit ""
    }

    /*
     * Observation, Condition, Encounter,
     * DiagnosticReport, Procedure, etc.
     */
    Set tSubject =
        pFHIR.%Get("subject")

    If $IsObject(tSubject) {
        Set tReference =
            tSubject.%Get("reference", "")

        If tReference '= "" {
            Quit tReference
        }
    }

    /*
     * Claim and some other resource types.
     */
    Set tPatient =
        pFHIR.%Get("patient")

    If $IsObject(tPatient) {
        Set tReference =
            tPatient.%Get("reference", "")

        If tReference '= "" {
            Quit tReference
        }
    }

    Quit ""
}

/// Produces the text sent to the embedding model.
Method FHIRToSearchText(pFHIR As %DynamicObject, pPatientId As %String, pResourceType As %String, pResourceId As %String) As %String
{
    Set tText =
        "FHIR resource type: "_pResourceType_". "

    If pPatientId '= "" {
        Set tText =
            tText_"Patient reference: "_pPatientId_". "
    }

    Set tText =
        tText_"Resource ID: "_pResourceId_". "

    /*
     * Suitable for an initial synthetic-data prototype.
     *
     * Later, replace the complete JSON with a concise,
     * resource-specific clinical summary.
     */
    Set tText =
        tText_"FHIR content: "_pFHIR.%ToJSON()

    /*
     * Match the VARCHAR(32000) source-column limit.
     */
    Quit $Extract(tText, 1, 32000)
}

/// Inserts or updates the source text.
/// 
/// IRIS automatically invokes OpenAI and populates
/// SearchEmbedding because it is an EMBEDDING column
/// sourced from SearchText.
Method StoreResource(pPatientId As %String, pResourceType As %String, pResourceId As %String, pVersionId As %String, pSearchText As %String) As %Status
{
    Set tSQL =
        "INSERT OR UPDATE INTO AmbientFHIR.VectorStore "
        _"(PatientId, ResourceType, ResourceId, "
        _"VersionId, SearchText, UpdatedAt) "
        _"VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"

    Set tStatement =
        ##class(%SQL.Statement).%New()

    Set tSC =
        tStatement.%Prepare(tSQL)

    Quit:$$$ISERR(tSC) tSC

    Set tResult =
        tStatement.%Execute(
            pPatientId,
            pResourceType,
            pResourceId,
            pVersionId,
            pSearchText
        )

    If '$IsObject(tResult) {
        Quit $$$ERROR($$$GeneralError, "Vector store operation returned no result")
    }

    If tResult.%SQLCODE < 0 {
        Quit $$$ERROR($$$GeneralError, "Vector store operation failed: "_tResult.%Message)
    }

    $$$LOGINFO("Stored vector for "_pResourceType_"/"_pResourceId)

    Quit $$$OK
}

}
