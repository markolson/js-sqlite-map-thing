function Parser(data) {
    this.data = data;
    this.ofs = 0;
    this.length = data.length;

	this.pos = function() { return this.ofs }

    this.get_int = function(intsize) {
        value = 0;
        while(intsize--)
            value = (value<<8) + this.data.charCodeAt(this.ofs++);
        return value;
    }
    this.get_str = function() {
        length = this.get_int(2);
        if(length==0xffff)
            return '';
        value = this.data.substr(this.ofs,length)
        this.ofs += length;
        return value;
    }
    this.skip_str = function(numstrs) {
        while(numstrs--) {
            length = this.get_int(2);
            if(length<0xffff)
                this.ofs += length;
        }
    }
    this.skip = function(size) {
        this.ofs += size;
    }
    this.bytes = function(size) {
        value = this.data.substr(this.ofs,size);
        this.ofs += size;
        return value;
    }

	this.varint = function() {
		segments = [];
		count = 0
		msb = 255;
		
		while((msb & 128) == 128 && count < 10) {
			count = count + 1;
			msb = this.get_int(1);
			segments.push(msb)
			//break;
		}
		i = $.map(segments, function(t) { return $.strPad(t.toString(2),8,0).substr(1,7) }).join('')
		return parseInt(i,2);
	
	}

    this.more = function() {
        return this.ofs < this.length;
    }
    this.seek = function(ofs) {
        this.ofs = ofs;
    }


}

read_column = function(x, payload) { 
	if(x==0) { return null }
	if(x==1) { return payload.get_int(1) }
	if(x==2) { return payload.get_int(2) }
	if(x==4) { return payload.get_int(4) }
	if(x==7) { return payload.bytes(8) }
	if(x > 11 && x%2==0) { return payload.bytes((x-12)/2) }
	if(x > 12 && x%2==1) { return payload.bytes((x-13)/2) }
}

function load_loc_db(reader) {
    return function(e) {
        var data = new Parser(reader.result);
        lilog('db is '+data.length+' bytes');
        var magic = data.bytes(15);
        lilog('magic is '+magic);
        if(("SQLite format 3"!=magic)||(0!=data.bytes(1).charCodeAt(0)))
            throw "location db has bad magic ("+magic+")";
        var page_size = data.get_int(2)*256;
        lilog(page_size);
        data.seek(100);
        
    }
}

function load_mbdx(reader,files,target) {
    return function(e) {
        var data = new Parser(reader.result);
        if("mbdx" != data.bytes(4))
            throw "manifest MBDX has bad magic";
        data.skip(6);
        var output = [];
        var file = null;
        while(data.more()) {
            var fileID = "";
            for(var i=0; i<20; i++) {
                var hex = data.bytes(1).charCodeAt(0).toString(16);
                while(hex.length < 2)
                    hex = '0'+hex;
                fileID += hex;
            }
            if(target == data.get_int(4)+6) {
                lilog(fileID);
                file = files[fileID];
                break;
            }
            data.skip(2);
        }
        if(file == null)
            throw "Cannot resolve Library/Caches/locationd/consolidated.db";
        db = new FileReader();
        db.onload = SQR.loadfile(db);
		db.onerror = function(e) { alert(e) }
        db.readAsBinaryString(file);
    }
}

function load_mbdb(reader,files) {
    return function(evt) {
        var data = new Parser(evt.target.result);
       lilog('manifest is '+ data.length+' bytes');
        if("mbdb" != data.bytes(4))
            throw "manifest MBDB has bad magic";
        data.skip(2);
        var locationd;
        while(data.more()) {
            var start = data.ofs;
            data.skip_str(1);
            if("Library/Caches/locationd/consolidated.db" == data.get_str()) {
                locationd = start;
                break;
            }
            data.skip_str(3);
            data.skip(4*9+3);
            var num_props = data.get_int(1);
            for(var i=0; i<num_props; i++) {
                data.skip_str(2);
            }
        }
        if(locationd == null)
            throw "Library/Caches/locationd/consolidated.db is not in index"
        var mbdx = new FileReader();
        mbdx.onloadend = load_mbdx(mbdx,files,locationd);
		mbdx.onerror = function(e) { alert(e) }
        mbdx.readAsBinaryString(files["Manifest.mbdx"]);
    }
}