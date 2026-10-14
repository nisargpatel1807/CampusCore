const router = require("express").Router();
const mongoose = require("mongoose");
const Division = require("../models/Division");
const User = require("../models/user");
const Subject = require("../models/Subject");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");
const Course = require("../models/course.JS");
router.use(authMiddleware);
const isAdmin = (req,res,next) => req.user?.role === "admin" ? next() : res.status(403).json({message:"Admin access required."});
router.get("/", isAdmin, async (req,res) => { try { const filter={}; if(req.query.course) filter.course=req.query.course; if(req.query.semester) filter.semester=Number(req.query.semester); res.json(await Division.find(filter).sort({course:1,semester:1,name:1}).lean()); } catch(e){res.status(500).json({message:"Failed to load divisions."});} });
router.post("/", isAdmin, async (req,res) => { try { const course=String(req.body.course||"").trim(); const semester=Number(req.body.semester); const name=String(req.body.name||"").trim().toUpperCase(); const capacity=Number(req.body.capacity||60); if(!course || !Number.isInteger(semester)||semester<1||semester>20||! /^[A-Z0-9_-]{1,10}$/.test(name)) return res.status(400).json({message:"Course, valid semester and division name are required."}); const doc=await Division.create({course,semester,name,capacity}); res.status(201).json(doc); } catch(e){res.status(e.code===11000?409:400).json({message:e.code===11000?"This division already exists for the selected course and semester.":"Could not create division."});} });
router.put("/:id", isAdmin, async (req,res) => { try { if(!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({message:"Invalid division ID."}); const update={}; if(req.body.name!==undefined) update.name=String(req.body.name).trim().toUpperCase(); if(req.body.capacity!==undefined) update.capacity=Number(req.body.capacity); if(req.body.active!==undefined) update.active=Boolean(req.body.active); const d=await Division.findByIdAndUpdate(req.params.id,update,{new:true,runValidators:true}); if(!d)return res.status(404).json({message:"Division not found."}); res.json(d); } catch(e){res.status(e.code===11000?409:400).json({message:"Could not update division."});} });
router.delete("/:id", isAdmin, async (req,res)=>{try{ const d=await Division.findById(req.params.id); if(!d)return res.status(404).json({message:"Division not found."}); const students=await User.countDocuments({role:"student",course:d.course,semester:d.semester,division:d.name}); if(students) return res.status(409).json({message:`Cannot delete: ${students} student(s) are assigned. Reassign them first.`}); await d.deleteOne(); res.json({message:"Division deleted."}); }catch(e){res.status(500).json({message:"Could not delete division."});}});
router.get("/students", isAdmin, async (req,res)=>{try{const f={role:"student"};if(req.query.course)f.course=req.query.course;if(req.query.semester)f.semester=Number(req.query.semester);if(req.query.division)f.division=String(req.query.division).toUpperCase();if(req.query.unassigned==="true"){f.$or=[{division:{$exists:false}},{division:""},{division:null}];}res.json(await User.find(f).select("-password").sort({course:1,semester:1,division:1,name:1}).lean());}catch(e){res.status(500).json({message:"Could not load students."});}});
router.put("/students/:id/assignment", isAdmin, async (req,res)=>{
 try {
  const student=await User.findOne({_id:req.params.id,role:"student"});
  if(!student)return res.status(404).json({message:"Student not found."});
  const course=String(req.body.course||student.course).trim();
  const semester=Number(req.body.semester||student.semester);
  const division=String(req.body.division||"").trim().toUpperCase();
  if(division){
   const d=await Division.findOne({course,semester,name:division,active:true});
   if(!d)return res.status(400).json({message:"Selected division is not active for this course and semester."});
  }
  student.course=course; student.department=course; student.semester=semester; student.division=division;
  student.year=semester<=2?"1st Year":semester<=4?"2nd Year":semester<=6?"3rd Year":"4th Year";
  await student.save(); res.json({message:division?"Student division assigned.":"Student division cleared.",student:{...student.toObject(),password:undefined}});
 } catch(e){res.status(500).json({message:"Could not update student division."});}
});
router.put("/students/bulk-assignment", isAdmin, async (req,res)=>{
 try {
  const ids=Array.isArray(req.body.studentIds)?[...new Set(req.body.studentIds.map(String))]:[];
  const course=String(req.body.course||"").trim(); const semester=Number(req.body.semester); const division=String(req.body.division||"").trim().toUpperCase();
  if(!ids.length)return res.status(400).json({message:"Select at least one student."});
  if(!course||!Number.isInteger(semester)||semester<1)return res.status(400).json({message:"Course and semester are required."});
  if(division){const d=await Division.findOne({course,semester,name:division,active:true});if(!d)return res.status(400).json({message:"Selected division is not active for this course and semester."});}
  const result=await User.updateMany({_id:{$in:ids},role:"student",course,semester},{$set:{division}});
  res.json({message:`Updated ${result.modifiedCount} student(s).`,modifiedCount:result.modifiedCount});
 } catch(e){res.status(500).json({message:"Bulk division assignment failed."});}
});
router.get("/subjects", isAdmin, async (req,res)=>{try{const f={};if(req.query.course){const c=await Course.findOne({courseName:req.query.course}).select("_id").lean();if(!c)return res.json([]);f.course=c._id;}if(req.query.semester)f.semester=Number(req.query.semester);const subjects=await Subject.find(f).populate("course","courseName courseCode").populate("teacher","name id_no email").sort({subjectName:1}).lean();res.json(subjects);}catch(e){res.status(500).json({message:"Could not load subject allocations."});}});
router.put("/subjects/:id/divisions", isAdmin, async (req,res)=>{try{const subject=await Subject.findById(req.params.id);if(!subject)return res.status(404).json({message:"Subject not found."});const names=[...new Set((Array.isArray(req.body.divisions)?req.body.divisions:[]).map(x=>String(x).trim().toUpperCase()).filter(Boolean))];const course=await Course.findById(subject.course);const courseName=course?.courseName;const valid=await Division.find({course:courseName,semester:subject.semester,name:{$in:names},active:true});if(valid.length!==names.length)return res.status(400).json({message:"One or more divisions are invalid for this subject's course and semester."});subject.divisions=names;await subject.save();res.json({message:"Subject division allocation saved.",subject});}catch(e){res.status(500).json({message:"Could not save subject division allocation."});}});
module.exports=router;
