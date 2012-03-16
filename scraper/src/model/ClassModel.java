package model;

public class ClassModel {
	private String department;
	private String number;
	private String title;

	public String getDepartment() {
		return department;
	}

	public void setDepartment(String department) {
		this.department = department;
	}

	public String getNumber() {
		return number;
	}

	public void setNumber(String number) {
		this.number = number;
	}

	public String getTitle() {
		return title;
	}

	public void setTitle(String title) {
		this.title = title;
	}

	public ClassModel(String department, String number, String title) {
		super();
		this.department = department;
		this.number = number;
		this.title = title;
	}

	@Override
	public String toString() {
		return String.format("ClassModel: %s %s (%s)", department, number,
				title);
	}
}
