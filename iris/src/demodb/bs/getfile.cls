Class demodb.bs.getfile Extends Ens.BusinessService
{

Parameter ADAPTER = "EnsLib.File.InboundAdapter";

Method OnProcessInput(pInput As %Stream.Object, Output pOutput As %RegisteredObject) As %Status
{
	set ifilePathName=pInput.Filename						//file path+name
	set ifileName=##class(%File).GetFilename(ifilePathName) //file name
	set ResourceType=$p(ifileName,"Data",1)		//extract the resource type from the file name
	
	set counter=1  //records read
	while 'pInput.AtEnd {
		set line=pInput.ReadLine()
		
		set tablename=$p(line,",",1)
		set rowid=$p(line,",",2)
		
		set tRequest = ##class(demodb.msg.simpleReqMsg).%New()
		set tRequest.tablename=tablename
		set tRequest.rowid=rowid
		
        if (tablename="episode")
		{
			set rtst=..SendRequestAsync("episodeToHL7ADTA01",tRequest)
			set rtst=..SendRequestAsync("dbEpisodeToFHIR",tRequest)
		}
		if (tablename="patient")
		{
			set rtst=..SendRequestAsync("dbPatientToFHIR",tRequest)
		}

		
		set counter=counter+1
	}
	Quit $$$OK	
	//Quit $$$ERROR($$$NotImplemented)
}

}
